const mongoose = require("mongoose");

const parcelSchema = new mongoose.Schema(
  {
    trackingId: { type: String, required: true },
    weightKg: Number,
    valueEur: Number,
    destination: String,
    assignedDepartment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
    },
    insuranceApproval: {
      status: {
        type: String,
        enum: ["pending", "approved", "rejected", "not_required"],
        default: "not_required",
      },
      by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      at: Date,
    },
    rawXml: String,
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Parcel", parcelSchema);
