const mongoose = require("mongoose");

const DB_URI =
  process.env.MONGO_URI || "mongodb://localhost:27017/parcel-distribution";

async function connectDB() {
  try {
    if (mongoose.connection.readyState === 1) {
      return;
    }

    await mongoose.connect(DB_URI);
    console.log("MongoDB connected successfully!");
  } catch (err) {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  }
}

module.exports = connectDB;
