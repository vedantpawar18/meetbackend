// src/utils/rulesEngine.js
// Improved rules engine: sorts buckets by maxKg (ascending) so overlapping/wrong DB order won't break routing.

const Department = require('../models/Department');

function parseMaxKg(v) {
  if (v === null || v === undefined) return Number.POSITIVE_INFINITY;
  // accept numeric or string numeric
  const n = Number(v);
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
}

async function resolveDeptCandidate(candidate) {
  if (!candidate) return null;
  candidate = String(candidate).trim();
  if (!candidate) return null;

  // If already looks like an ObjectId (24 hex chars), verify it exists
  if (/^[0-9a-fA-F]{24}$/.test(candidate)) {
    try {
      const found = await Department.findById(candidate).lean();
      if (found) return String(found._id);
    } catch (e) { /* ignore */ }
  }

  // Try to find department by name (case-insensitive)
  try {
    const found = await Department.findOne({ name: new RegExp(`^${candidate}$`, 'i') }).lean();
    if (found) return String(found._id);
  } catch (e) { /* ignore */ }

  return null;
}

async function evaluateRulesForParcel(parcel, rules = []) {
  const result = { assignedDepartment: null, assignedDepartmentName: null, requiresInsurance: false, appliedRules: [] };
  const threshold = Number(process.env.INSURANCE_THRESHOLD || 1000);

  if (parcel.valueEur && Number(parcel.valueEur) > threshold) {
    result.requiresInsurance = true;
  }

  if (!Array.isArray(rules)) rules = [];

  // sort rules by priority ascending (lower number = higher priority)
  const sortedRules = rules.slice().sort((a, b) => (a.priority || 0) - (b.priority || 0));

  for (const rule of sortedRules) {
    if (rule.type === 'weight') {
      const buckets = (rule.config && Array.isArray(rule.config.buckets)) ? rule.config.buckets.slice() : [];

      if (!buckets.length) continue;

      // annotate buckets with numericMax and sort ascending (smallest max first). null/undefined -> +Infinity
      const annotated = buckets.map(b => {
        const rawMax = (b && Object.prototype.hasOwnProperty.call(b, 'maxKg')) ? b.maxKg : null;
        return { raw: b, numericMax: parseMaxKg(rawMax), dept: b && b.departmentId };
      }).sort((x, y) => {
        // sort by numericMax asc (so smallest maxKg matches first)
        if (x.numericMax === y.numericMax) return 0;
        return x.numericMax < y.numericMax ? -1 : 1;
      });

      // find first bucket that matches parcel weight (or fallback)
      for (const a of annotated) {
        // If parcel weight is undefined, skip numeric matching and only allow the fallback bucket (numericMax === +Infinity)
        if (typeof parcel.weightKg === 'number' && Number.isFinite(parcel.weightKg)) {
          if (parcel.weightKg <= a.numericMax) {
            // resolve department candidate to an ObjectId string if possible
            const deptId = await resolveDeptCandidate(a.dept);
            if (deptId) {
              result.assignedDepartment = deptId;
              // try to fetch department name for convenience
              try {
                const d = await Department.findById(deptId).lean();
                if (d) result.assignedDepartmentName = d.name;
              } catch (e) { /* ignore */ }
              result.appliedRules.push(rule.name || rule._id);
            } else {
              // dept not resolvable - ignore and continue to next bucket
              continue;
            }
            break; // stop after first matching bucket
          } else {
            // not matched, continue
            continue;
          }
        } else {
          // no numeric weight provided - only match a fallback bucket (numericMax === +Infinity)
          if (!isFinite(a.numericMax)) {
            const deptId = await resolveDeptCandidate(a.dept);
            if (deptId) {
              result.assignedDepartment = deptId;
              try {
                const d = await Department.findById(deptId).lean();
                if (d) result.assignedDepartmentName = d.name;
              } catch (e) {}
              result.appliedRules.push(rule.name || rule._id);
            }
            break;
          }
        }
      } // end annotated loop

      // if we assigned a department from this rule, stop processing later rules
      if (result.assignedDepartment) break;
    }

    // other rule types can be handled here (e.g., destination-based)
  } // end rules loop

  return result;
}

module.exports = { evaluateRulesForParcel, resolveDeptCandidate };
