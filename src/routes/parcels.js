const express = require("express");
const multer = require("multer");
const xml2js = require("xml2js");
const Parcel = require("../models/Parcel");
const Rule = require("../models/Rule");
const Department = require("../models/Department");
const auth = require("../middleware/auth");
const { evaluateRulesForParcel } = require("../utils/rulesEngine");
const { resolveDepartmentId } = require("../utils/departmentUtils");

const upload = multer({ storage: multer.memoryStorage() });
const router = express.Router();

async function buildParcelPayload(data, rules = null, evaluateRulesFn = null) {
  let trackingId =
    data.trackingId || data.TrackingId || data.tracking || data.id;
  if (!trackingId) {
    trackingId = `auto-${Date.now()}`;
  }

  let weightKg = undefined;
  if (data.weightKg !== undefined) {
    weightKg = Number(data.weightKg);
  } else if (data.Weight !== undefined) {
    weightKg = Number(data.Weight);
  } else if (data.weight !== undefined) {
    weightKg = Number(data.weight);
  }

  let valueEur = undefined;
  if (data.valueEur !== undefined) {
    valueEur = Number(data.valueEur);
  } else if (data.Value !== undefined) {
    valueEur = Number(data.Value);
  } else if (data.value !== undefined) {
    valueEur = Number(data.value);
  }

  const destination = data.destination || data.Destination || "";

  const payload = {
    trackingId: trackingId,
    weightKg: Number.isFinite(weightKg) ? weightKg : undefined,
    valueEur: Number.isFinite(valueEur) ? valueEur : undefined,
    destination: destination || undefined,
    rawXml: typeof data === "string" ? data : JSON.stringify(data),
  };

  const insuranceThreshold = Number(process.env.INSURANCE_THRESHOLD || 1000);
  const requiresInsurance =
    payload.valueEur && Number(payload.valueEur) > insuranceThreshold;

  if (requiresInsurance) {
    payload.insuranceApproval = { status: "pending" };
  } else {
    let resolvedDeptId = null;

    if (data.assignedDepartment) {
      resolvedDeptId = await resolveDepartmentId(data.assignedDepartment);
    }

    if (!resolvedDeptId && rules && evaluateRulesFn) {
      const evaluationResult = await evaluateRulesFn(
        {
          weightKg: payload.weightKg,
          valueEur: payload.valueEur,
        },
        rules
      );

      if (evaluationResult && evaluationResult.assignedDepartment) {
        resolvedDeptId = await resolveDepartmentId(
          evaluationResult.assignedDepartment
        );
      }
    }

    if (!resolvedDeptId && payload.weightKg !== undefined) {
      let defaultDepartmentName = "";
      if (payload.weightKg <= 1) {
        defaultDepartmentName = "Mail";
      } else if (payload.weightKg <= 10) {
        defaultDepartmentName = "Regular";
      } else {
        defaultDepartmentName = "Heavy";
      }
      resolvedDeptId = await resolveDepartmentId(defaultDepartmentName);
    }

    if (resolvedDeptId) {
      payload.assignedDepartment = resolvedDeptId;
    }

    payload.insuranceApproval = { status: "not_required" };
  }

  return payload;
}

router.post("/", auth, async (req, res) => {
  try {
    const data = req.body || {};

    const trackingId =
      data.trackingId ||
      data.TrackingId ||
      data.tracking ||
      data.id ||
      `auto-${Date.now()}`;

    const existing = await Parcel.findOne({ trackingId });
    if (existing) {
      return res.status(409).json({
        message: "Parcel with this tracking ID already exists",
        trackingId: trackingId,
        existingId: String(existing._id),
      });
    }

    const rules = await Rule.find().lean();

    const payload = await buildParcelPayload(
      data,
      rules,
      evaluateRulesForParcel
    );

    const parcel = await Parcel.create(payload);

    res.status(201).json(parcel);
  } catch (err) {
    console.error("Error creating parcel:", err);
    res.status(400).json({ message: err.message || "Failed to create parcel" });
  }
});

router.post("/upload", auth, upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "File is required" });
  }

  const xml = req.file.buffer.toString("utf8");

  const parser = new xml2js.Parser({ explicitArray: false, trim: true });

  try {
    const parsedObject = await parser.parseStringPromise(xml);

    const parcelsRaw =
      (parsedObject.Container && parsedObject.Container.Parcel) ||
      (parsedObject.Parcels && parsedObject.Parcels.Parcel) ||
      [];

    const parcelsList = Array.isArray(parcelsRaw) ? parcelsRaw : [parcelsRaw];

    const rules = await Rule.find().lean();

    const created = [];
    const failed = [];
    const duplicates = [];

    for (const parcelData of parcelsList) {
      try {
        const trackingId =
          parcelData.trackingId ||
          parcelData.TrackingId ||
          parcelData.tracking ||
          parcelData.id ||
          `auto-${Date.now()}`;

        const existing = await Parcel.findOne({ trackingId });
        if (existing) {
          duplicates.push({
            trackingId: trackingId,
            error: "Parcel with this tracking ID already exists",
            existingId: String(existing._id),
          });
          continue;
        }

        const payload = await buildParcelPayload(
          parcelData,
          rules,
          evaluateRulesForParcel
        );

        const parcelDoc = await Parcel.create(payload);
        created.push(parcelDoc);
      } catch (parcelError) {
        console.error("Failed to create parcel from XML item:", parcelError);
        failed.push({
          raw: parcelData,
          error: parcelError.message,
        });
      }
    }

    res.json({
      total: parcelsList.length,
      created: created.length,
      failed: failed.length,
      duplicates: duplicates.length,
      parcels: created,
      failedItems: failed.length > 0 ? failed : undefined,
      duplicateItems: duplicates.length > 0 ? duplicates : undefined,
    });
  } catch (err) {
    console.error("XML parse error:", err);
    res
      .status(500)
      .json({ message: "Failed to parse XML file", error: err.message });
  }
});

router.get("/", auth, async (req, res) => {
  try {
    const query = {};

    if (req.query.dept) {
      query.assignedDepartment = req.query.dept;
    }

    const parcels = await Parcel.find(query)
      .populate("assignedDepartment")
      .sort("-createdAt");

    res.json(parcels);
  } catch (err) {
    console.error("Error fetching parcels:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/:id", auth, async (req, res) => {
  const p = await Parcel.findById(req.params.id).populate("assignedDepartment");
  if (!p) return res.status(404).json({});
  res.json(p);
});

router.put("/:id", auth, async (req, res) => {
  const p = await Parcel.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
  });
  res.json(p);
});

router.post("/:id/approve-insurance", auth, async (req, res) => {
  try {
    if (req.user.role !== "insurance" && req.user.role !== "admin") {
      return res.status(403).json({
        message: "Only insurance agents and admins can approve insurance",
      });
    }

    const parcel = await Parcel.findById(req.params.id);
    if (!parcel) {
      return res.status(404).json({ message: "Parcel not found" });
    }

    parcel.insuranceApproval = {
      status: "approved",
      by: req.user._id,
      at: new Date(),
    };

    if (!parcel.assignedDepartment) {
      let departmentName = "";
      if (parcel.weightKg <= 1) {
        departmentName = "Mail";
      } else if (parcel.weightKg <= 10) {
        departmentName = "Regular";
      } else {
        departmentName = "Heavy";
      }

      const department = await Department.findOne({ name: departmentName });
      if (department) {
        parcel.assignedDepartment = department._id;
      }
    }

    await parcel.save();

    res.json(parcel);
  } catch (err) {
    console.error("Error approving insurance:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.delete("/:id", auth, async (req, res) => {
  if (req.user.role !== "admin")
    return res.status(403).json({ message: "Forbidden" });
  try {
    const p = await Parcel.findByIdAndDelete(req.params.id);
    if (!p) return res.status(404).json({ message: "Not found" });
    res.json({ ok: true, deletedId: String(p._id) });
  } catch (err) {
    console.error("Delete parcel error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.delete("/", auth, async (req, res) => {
  if (req.user.role !== "admin")
    return res.status(403).json({ message: "Forbidden" });
  try {
    const result = await Parcel.deleteMany({});
    res.json({ ok: true, deletedCount: result.deletedCount });
  } catch (err) {
    console.error("Delete all parcels error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
