const express = require("express");
const auth = require("../middleware/auth");
const Rule = require("../models/Rule");
const Parcel = require("../models/Parcel");
const { evaluateRulesForParcel } = require("../utils/rulesEngine");
const { resolveDepartmentId } = require("../utils/departmentUtils");

const router = express.Router();

router.get("/", auth, async (req, res) => {
  try {
    const rules = await Rule.find().sort("priority");
    res.json(rules);
  } catch (err) {
    console.error("Error fetching rules:", err);
    res.status(500).json({ message: "Server error" });
  }
});

async function normalizeBuckets(buckets) {
  if (!Array.isArray(buckets)) {
    return [];
  }

  const normalizedBuckets = [];

  for (const bucket of buckets) {
    const deptValue =
      bucket.departmentId ||
      bucket.department ||
      bucket.deptId ||
      bucket.dept ||
      bucket.name;

    const deptId = await resolveDepartmentId(deptValue);

    if (!deptId) {
      throw new Error(`Department not found: ${deptValue}`);
    }

    let maxKg = null;
    if (
      bucket.maxKg !== "" &&
      bucket.maxKg !== null &&
      bucket.maxKg !== undefined
    ) {
      maxKg = Number(bucket.maxKg);
      if (!Number.isFinite(maxKg)) {
        maxKg = null;
      }
    }

    normalizedBuckets.push({
      departmentId: deptId,
      maxKg: maxKg,
    });
  }

  return normalizedBuckets;
}

router.post("/", auth, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Only admins can create rules" });
    }

    const ruleData = { ...req.body };

    if (
      ruleData.type === "weight" &&
      ruleData.config &&
      Array.isArray(ruleData.config.buckets)
    ) {
      ruleData.config = {
        ...ruleData.config,
        buckets: await normalizeBuckets(ruleData.config.buckets),
      };
    }

    const rule = await Rule.create(ruleData);

    res.status(201).json(rule);
  } catch (err) {
    console.error("Error creating rule:", err);
    res.status(400).json({ message: err.message });
  }
});

router.put("/:id", auth, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Only admins can update rules" });
    }

    const ruleId = req.params.id;

    const ruleData = { ...req.body };

    if (
      ruleData.type === "weight" &&
      ruleData.config &&
      Array.isArray(ruleData.config.buckets)
    ) {
      ruleData.config = {
        ...ruleData.config,
        buckets: await normalizeBuckets(ruleData.config.buckets),
      };
    }

    const updatedRule = await Rule.findByIdAndUpdate(ruleId, ruleData, {
      new: true,
    });

    if (!updatedRule) {
      return res.status(404).json({ message: "Rule not found" });
    }

    if (ruleData.type === "weight") {
      try {
        const parcelsToUpdate = await Parcel.find({
          "insuranceApproval.status": { $ne: "pending" },
        });

        const allRules = await Rule.find().lean();

        let updatedCount = 0;
        for (const parcel of parcelsToUpdate) {
          try {
            const evaluationResult = await evaluateRulesForParcel(
              {
                weightKg: parcel.weightKg,
                valueEur: parcel.valueEur,
              },
              allRules
            );

            if (evaluationResult.assignedDepartment) {
              parcel.assignedDepartment = evaluationResult.assignedDepartment;
              await parcel.save();
              updatedCount++;
            }
          } catch (parcelError) {
            console.error(
              `Failed to re-evaluate parcel ${parcel._id}:`,
              parcelError
            );
          }
        }

        console.log(`Re-evaluated ${updatedCount} parcels after rule update`);
      } catch (reEvaluationError) {
        console.error(
          "Error re-evaluating parcels after rule update:",
          reEvaluationError
        );
      }
    }

    res.json(updatedRule);
  } catch (err) {
    console.error("Error updating rule:", err);
    res.status(400).json({ message: err.message });
  }
});

router.delete("/:id", auth, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Only admins can delete rules" });
    }

    const ruleId = req.params.id;

    const deleted = await Rule.findByIdAndDelete(ruleId);

    if (!deleted) {
      return res.status(404).json({ message: "Rule not found" });
    }

    res.json({ ok: true, message: "Rule deleted successfully" });
  } catch (err) {
    console.error("Error deleting rule:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
