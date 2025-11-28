const express = require("express");
const auth = require("../middleware/auth");
const Department = require("../models/Department");

const router = express.Router();

router.get("/", auth, async (req, res) => {
  try {
    const departments = await Department.find().sort("name");
    res.json(departments);
  } catch (err) {
    console.error("Error fetching departments:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/", auth, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res
        .status(403)
        .json({ message: "Only admins can create departments" });
    }

    const { name, description } = req.body;

    const department = await Department.create({ name, description });

    res.status(201).json(department);
  } catch (err) {
    console.error("Error creating department:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.put("/", auth, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res
        .status(403)
        .json({ message: "Only admins can update departments" });
    }

    const { id, _id, name, description } = req.body;

    const departmentId = id || _id;

    if (departmentId) {
      const updated = await Department.findByIdAndUpdate(
        departmentId,
        { name, description },
        { new: true }
      );

      if (!updated) {
        return res.status(404).json({ message: "Department not found" });
      }

      return res.json(updated);
    } else {
      const created = await Department.create({ name, description });
      return res.status(201).json(created);
    }
  } catch (err) {
    console.error("Error updating/creating department:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

router.put("/:id", auth, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res
        .status(403)
        .json({ message: "Only admins can update departments" });
    }

    const departmentId = req.params.id;

    const updated = await Department.findByIdAndUpdate(departmentId, req.body, {
      new: true,
    });

    if (!updated) {
      return res.status(404).json({ message: "Department not found" });
    }

    res.json(updated);
  } catch (err) {
    console.error("Error updating department:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.delete("/:id", auth, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res
        .status(403)
        .json({ message: "Only admins can delete departments" });
    }

    const departmentId = req.params.id;

    const deleted = await Department.findByIdAndDelete(departmentId);

    if (!deleted) {
      return res.status(404).json({ message: "Department not found" });
    }

    res.json({ ok: true, message: "Department deleted successfully" });
  } catch (err) {
    console.error("Error deleting department:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
