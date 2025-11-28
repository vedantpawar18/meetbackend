const mongoose = require("mongoose");
const Department = require("../models/Department");

async function resolveDepartmentId(deptValue) {
  if (!deptValue && deptValue !== 0) {
    return null;
  }
  const candidate = String(deptValue).trim();
  if (!candidate) {
    return null;
  }
  if (mongoose.Types.ObjectId.isValid(candidate)) {
    const found = await Department.findById(candidate).lean();
    if (found) {
      return String(found._id);
    }
    return null;
  }

  const byName = await Department.findOne({
    name: new RegExp(`^${candidate}$`, "i"),
  }).lean();

  if (byName) {
    return String(byName._id);
  }

  return null;
}

module.exports = {
  resolveDepartmentId,
};
