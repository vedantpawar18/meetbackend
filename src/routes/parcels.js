const express = require('express');
const multer = require('multer');
const xml2js = require('xml2js');
const Parcel = require('../models/Parcel');
const Rule = require('../models/Rule');
const Department = require('../models/Department');
const mongoose = require('mongoose'); // ensure mongoose is available here for helpers
const auth = require('../middleware/auth');
const { evaluateRulesForParcel } = require('../utils/rulesEngine');

const upload = multer({ storage: multer.memoryStorage() });
const router = express.Router();

/**
 * Resolve department identifier to a valid ObjectId string or null.
 * deptVal can be:
 *  - ObjectId string ("64...") -> returned if valid
 *  - department name ("Mail") -> resolved to _id if found
 *  - null/empty/invalid -> returns null
 */
async function resolveDepartmentId(deptVal) {
  if (!deptVal) return null;
  const candidate = String(deptVal).trim();
  if (!candidate) return null;

  // If already ObjectId-like, accept it (but verify it exists)
  if (mongoose.Types.ObjectId.isValid(candidate)) {
    const found = await Department.findById(candidate).lean();
    return found ? String(found._id) : null;
  }

  // Try to find department by name (case-insensitive)
  const byName = await Department.findOne({ name: new RegExp(`^${candidate}$`, 'i') }).lean();
  return byName ? String(byName._id) : null;
}

/**
 * Build a normalized parcel object (not saved) from incoming raw data.
 */
async function buildParcelPayload(data, rules = null, evaluateRulesFn = null) {
  const trackingId = data.trackingId || data.TrackingId || data.tracking || data.id || `auto-${Date.now()}`;
  const weightKg = (data.weightKg !== undefined) ? Number(data.weightKg)
                  : (data.Weight !== undefined ? Number(data.Weight)
                  : (data.weight !== undefined ? Number(data.weight) : undefined));
  const valueEur = (data.valueEur !== undefined) ? Number(data.valueEur)
                  : (data.Value !== undefined ? Number(data.Value)
                  : (data.value !== undefined ? Number(data.value) : undefined));
  const destination = data.destination || data.Destination || '';

  const payload = {
    trackingId,
    weightKg: Number.isFinite(weightKg) ? weightKg : undefined,
    valueEur: Number.isFinite(valueEur) ? valueEur : undefined,
    destination: destination || undefined,
    rawXml: typeof data === 'string' ? data : JSON.stringify(data)
  };

  // If explicit assignedDepartment provided in input, try to resolve it
  let resolvedDeptId = null;
  if (data.assignedDepartment) {
    resolvedDeptId = await resolveDepartmentId(data.assignedDepartment);
  }

  // If rules provided and evaluateRulesFn exists, run rules to get department/insurance
  let evalRes = null;
  if (!resolvedDeptId && rules && evaluateRulesFn) {
    evalRes = await evaluateRulesFn({ weightKg: payload.weightKg, valueEur: payload.valueEur }, rules);
    if (evalRes && evalRes.assignedDepartment) {
      resolvedDeptId = await resolveDepartmentId(evalRes.assignedDepartment);
    }
  }

  if (resolvedDeptId) payload.assignedDepartment = resolvedDeptId;

  if (evalRes && evalRes.requiresInsurance) {
    payload.insuranceApproval = { status: 'pending' };
  } else if (payload.valueEur && Number(payload.valueEur) > Number(process.env.INSURANCE_THRESHOLD || 1000)) {
    payload.insuranceApproval = { status: 'pending' };
  } else {
    payload.insuranceApproval = { status: 'not_required' };
  }

  return payload;
}

// create manual parcel (uses normalized builder)
router.post('/', auth, async (req, res) => {
  try {
    const data = req.body || {};
    const rules = await Rule.find().lean();
    const payload = await buildParcelPayload(data, rules, evaluateRulesForParcel);

    const parcel = await Parcel.create(payload);
    res.status(201).json(parcel);
  } catch (err) {
    console.error('Create parcel error:', err);
    res.status(400).json({ message: err.message || 'Failed to create parcel' });
  }
});

// upload XML and parse
router.post('/upload', auth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'file required' });
  const xml = req.file.buffer.toString('utf8');
  const parser = new xml2js.Parser({ explicitArray: false, trim: true });

  try {
    const obj = await parser.parseStringPromise(xml);
    const parcelsRaw = (obj.Container && obj.Container.Parcel) || (obj.Parcels && obj.Parcels.Parcel) || [];
    const list = Array.isArray(parcelsRaw) ? parcelsRaw : [parcelsRaw];

    // load rules once to reuse
    const rules = await Rule.find().lean();

    const created = [];
    const failed = [];

    for (const p of list) {
      try {
        // build normalized payload using same helper
        const payload = await buildParcelPayload(p, rules, evaluateRulesForParcel);

        // create only with validated payload
        const parcelDoc = await Parcel.create(payload);
        created.push(parcelDoc);
      } catch (err) {
        console.error('Failed to create parcel from XML item:', err);
        failed.push({ raw: p, error: err.message });
      }
    }

    res.json({ total: list.length, created: created.length, failed, parcels: created });
  } catch (err) {
    console.error('Parse error:', err);
    res.status(500).json({ message: 'Parse error', error: err.message });
  }
});

// list
router.get('/', auth, async (req, res) => {
  const q = {};
  if (req.query.dept) q.assignedDepartment = req.query.dept;
  const items = await Parcel.find(q).populate('assignedDepartment').sort('-createdAt');
  res.json(items);
});

router.get('/:id', auth, async (req, res) => {
  const p = await Parcel.findById(req.params.id).populate('assignedDepartment');
  if (!p) return res.status(404).json({});
  res.json(p);
});

router.put('/:id', auth, async (req, res) => {
  const p = await Parcel.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(p);
});

router.post('/:id/approve-insurance', auth, async (req, res) => {
  if (req.user.role !== 'insurance' && req.user.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });
  const p = await Parcel.findById(req.params.id);
  if (!p) return res.status(404).json({ message: 'Not found' });
  p.insuranceApproval = { status: 'approved', by: req.user._id, at: new Date() };
  // when approved assign department if null
  if (!p.assignedDepartment) {
    // simple fallback assignment by weight
    const dept = await Department.findOne({ name: p.weightKg <=1 ? 'Mail' : p.weightKg <=10 ? 'Regular' : 'Heavy' });
    if (dept) p.assignedDepartment = dept._id;
  }
  await p.save();
  res.json(p);
});

module.exports = router;
