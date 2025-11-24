/**
 * Simple rules engine:
 * - expects rules array sorted by priority asc
 * - currently supports type 'weight' with config.buckets = [{ maxKg, departmentId }]
 * - supports insurance threshold via env INSURANCE_THRESHOLD
 */

const Department = require('../models/Department');

async function evaluateRulesForParcel(parcel, rules) {
  // default result
  const result = { assignedDepartment: null, requiresInsurance: false, appliedRules: [] };
  // insurance check
  const threshold = Number(process.env.INSURANCE_THRESHOLD || 1000);
  if (parcel.valueEur && parcel.valueEur > threshold) result.requiresInsurance = true;

  for (const rule of rules.sort((a,b)=>a.priority - b.priority)) {
    if (rule.type === 'weight') {
      const buckets = rule.config && rule.config.buckets;
      if (!buckets) continue;
      for (const b of buckets) {
        if (b.maxKg === null || b.maxKg === undefined) {
          // matches anything beyond other buckets
          if (result.assignedDepartment === null) {
            result.assignedDepartment = b.departmentId; result.appliedRules.push(rule.name);
          }
        } else if (parcel.weightKg !== undefined && parcel.weightKg <= b.maxKg) {
          result.assignedDepartment = b.departmentId; result.appliedRules.push(rule.name);
          break;
        }
      }
    }
    // TODO: add more rule types later
    if (result.assignedDepartment) break; // first match
  }

  // try to resolve departmentId to name if it's an ObjectId
  if (result.assignedDepartment) {
    try {
      const d = await Department.findById(result.assignedDepartment).lean();
      if (d) result.assignedDepartmentName = d.name;
    } catch (e) { /* ignore */ }
  }

  return result;
}

module.exports = { evaluateRulesForParcel };
