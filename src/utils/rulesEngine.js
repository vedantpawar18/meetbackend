const Department = require("../models/Department");
const { resolveDepartmentId } = require("./departmentUtils");

function parseMaxKg(value) {
  if (value === null || value === undefined) {
    return Number.POSITIVE_INFINITY;
  }

  const numericValue = Number(value);

  return Number.isFinite(numericValue)
    ? numericValue
    : Number.POSITIVE_INFINITY;
}

async function evaluateRulesForParcel(parcel, rules = []) {
  const result = {
    assignedDepartment: null,
    assignedDepartmentName: null,
    requiresInsurance: false,
    appliedRules: [],
  };

  const insuranceThreshold = Number(process.env.INSURANCE_THRESHOLD || 1000);
  if (parcel.valueEur && Number(parcel.valueEur) > insuranceThreshold) {
    result.requiresInsurance = true;
  }

  if (!Array.isArray(rules)) {
    rules = [];
  }

  const sortedRules = rules.slice().sort((a, b) => {
    const priorityA = a.priority || 0;
    const priorityB = b.priority || 0;
    return priorityA - priorityB;
  });
  for (const rule of sortedRules) {
    if (rule.type === "weight") {
      const buckets =
        rule.config && Array.isArray(rule.config.buckets)
          ? rule.config.buckets.slice()
          : [];

      if (!buckets.length) {
        continue;
      }

      const annotatedBuckets = buckets
        .map((bucket) => {
          const rawMax =
            bucket && bucket.hasOwnProperty("maxKg") ? bucket.maxKg : null;
          return {
            raw: bucket,
            numericMax: parseMaxKg(rawMax),
            department: bucket && bucket.departmentId,
          };
        })
        .sort((bucketA, bucketB) => {
          if (bucketA.numericMax === bucketB.numericMax) return 0;
          return bucketA.numericMax < bucketB.numericMax ? -1 : 1;
        });

      for (const annotatedBucket of annotatedBuckets) {
        const parcelWeight = parcel.weightKg;

        if (typeof parcelWeight === "number" && Number.isFinite(parcelWeight)) {
          if (parcelWeight <= annotatedBucket.numericMax) {
            const deptId = await resolveDepartmentId(
              annotatedBucket.department
            );
            if (deptId) {
              result.assignedDepartment = deptId;

              try {
                const department = await Department.findById(deptId).lean();
                if (department) {
                  result.assignedDepartmentName = department.name;
                }
              } catch (err) {
                // Ignore errors
              }
              result.appliedRules.push(rule.name || rule._id);
              break;
            } else {
              continue;
            }
          } else {
            continue;
          }
        } else {
          if (!isFinite(annotatedBucket.numericMax)) {
            const deptId = await resolveDepartmentId(
              annotatedBucket.department
            );
            if (deptId) {
              result.assignedDepartment = deptId;
              try {
                const department = await Department.findById(deptId).lean();
                if (department) {
                  result.assignedDepartmentName = department.name;
                }
              } catch (err) {
                // Ignore errors
              }
              result.appliedRules.push(rule.name || rule._id);
            }
            break;
          }
        }
      }
      if (result.assignedDepartment) {
        break;
      }
    }
  }
  return result;
}

module.exports = { evaluateRulesForParcel };
