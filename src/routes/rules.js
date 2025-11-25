const express = require('express');
const auth = require('../middleware/auth');
const Rule = require('../models/Rule');
const Department = require('../models/Department');
const Parcel = require('../models/Parcel');
const mongoose = require('mongoose');
const { evaluateRulesForParcel } = require('../utils/rulesEngine');

const router = express.Router();

router.get('/', auth, async (req, res) => {
  const all = await Rule.find().sort('priority');
  res.json(all);
});

// helper: resolve department identifier (id or name) to ObjectId string
async function resolveDepartmentId(val) {
  if (!val && val !== 0) return null;
  const s = String(val).trim();
  if (!s) return null;
  if (mongoose.Types.ObjectId.isValid(s)) {
    const f = await Department.findById(s).lean();
    return f ? String(f._id) : null;
  }
  const byName = await Department.findOne({ name: new RegExp(`^${s}$`, 'i') }).lean();
  return byName ? String(byName._id) : null;
}

async function normalizeBuckets(buckets) {
  if (!Array.isArray(buckets)) return [];
  const out = [];
  for (const b of buckets) {
    const deptVal = b.departmentId || b.department || b.deptId || b.dept || b.name;
    const deptId = await resolveDepartmentId(deptVal);
    if (!deptId) throw new Error(`Unknown department for bucket: ${deptVal}`);
    const max = (b.maxKg === '' || b.maxKg === null || b.maxKg === undefined) ? null : Number(b.maxKg);
    out.push({ departmentId: deptId, maxKg: Number.isFinite(max) ? max : null });
  }
  return out;
}

router.post('/', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });
  try {
    const body = { ...req.body };
    console.log("body:", body);
    if (body.type === 'weight' && body.config && Array.isArray(body.config.buckets)) {
      body.config = { ...body.config };
      body.config.buckets = await normalizeBuckets(body.config.buckets);
    }
    const rule = await Rule.create(body);
    res.status(201).json(rule);
  } catch (err) {
    console.error('Create rule error:', err);
    res.status(400).json({ message: err.message });
  }
});

router.put('/:id', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });
  try {
    const body = { ...req.body };
    console.log("body:", body.config.buckets);
    if (body.type === 'weight' && body.config && Array.isArray(body.config.buckets)) {
      body.config = { ...body.config };
      body.config.buckets = await normalizeBuckets(body.config.buckets);
    }
    const rule = await Rule.findByIdAndUpdate(req.params.id, body, { new: true });
    
    // If this is a weight rule, re-evaluate all parcels that don't require insurance
    if (body.type === 'weight') {
      try {
        // Find all parcels that are NOT awaiting insurance (either 'not_required' or 'approved')
        const parcelsToUpdate = await Parcel.find({
          'insuranceApproval.status': { $ne: 'pending' }
        });
        
        // Load all rules to pass to evaluateRulesForParcel
        const allRules = await Rule.find().lean();
        
        // Re-evaluate each parcel and update assignedDepartment
        for (const parcel of parcelsToUpdate) {
          try {
            const evalRes = await evaluateRulesForParcel(
              { weightKg: parcel.weightKg, valueEur: parcel.valueEur },
              allRules
            );
            
            // Update parcel with new department (if rule evaluation found one)
            if (evalRes.assignedDepartment) {
              parcel.assignedDepartment = evalRes.assignedDepartment;
            }
            await parcel.save();
          } catch (e) {
            console.error(`Failed to re-evaluate parcel ${parcel._id}:`, e);
            // Continue with next parcel even if one fails
          }
        }
        console.log(`Re-evaluated and updated ${parcelsToUpdate.length} parcels after rule update`);
      } catch (e) {
        console.error('Error re-evaluating parcels after rule update:', e);
        // Don't fail the rule update itself if parcel re-evaluation fails
      }
    }
    
    res.json(rule);
  } catch (err) {
    console.error('Update rule error:', err);
    res.status(400).json({ message: err.message });
  }
});

router.delete('/:id', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });
  await Rule.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
