require("dotenv").config();

const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");

const authRoutes = require("./routes/auth");
const parcelsRoutes = require("./routes/parcels");
const rulesRoutes = require("./routes/rules");
const departmentsRoutes = require("./routes/departments");
const usersRoutes = require("./routes/users");

const app = express();

app.use(cors());

app.use(express.json());

connectDB();

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});
app.use("/api/auth", authRoutes);
app.use("/api/parcels", parcelsRoutes);
app.use("/api/rules", rulesRoutes);
app.use("/api/departments", departmentsRoutes);
app.use("/api/users", usersRoutes);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});
