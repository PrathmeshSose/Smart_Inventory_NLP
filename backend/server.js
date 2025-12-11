require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 5000;

/* -------------------------------------------
   🧩 Middleware (CORS + JSON)
------------------------------------------- */
app.use(
  cors({
    origin: "*", // allow any frontend (React on port 5173, 3000, etc.)
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json());

/* -------------------------------------------
   🧠 MongoDB Connection
------------------------------------------- */
mongoose
  .connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
  })
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => {
    console.error("❌ MongoDB Error:", err.message);
    process.exit(1);
  });

/* -------------------------------------------
   🚦 Debug middleware (shows every request)
------------------------------------------- */
app.use((req, res, next) => {
  console.log(`➡️  ${req.method} ${req.url}`);
  next();
});

/* -------------------------------------------
   🤖 AI + CRUD Routes
------------------------------------------- */
app.use("/api/ai", require("./routes/aiExecutor")); // your Groq-based AI
app.use("/api/inventory", require("./routes/inventory")); // manual CRUD

/* -------------------------------------------
   📦 Frontend fetch route (/api/items)
------------------------------------------- */
app.get("/api/items", async (req, res) => {
  try {
    const Item = require("./models/Item");
    const items = await Item.find();
    res.json({ success: true, data: items });
  } catch (err) {
    console.error("❌ Error fetching items:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/* -------------------------------------------
   🩺 Optional AI Health Check Route
------------------------------------------- */
app.get("/api/ai/health", async (req, res) => {
  try {
    const mongoStatus = mongoose.connection.readyState === 1 ? "✅ Connected" : "❌ Not connected";
    res.json({
      mongo: mongoStatus,
      groqKey: !!process.env.GROQ_API_KEY,
      model: process.env.GROQ_MODEL,
      uptime: `${Math.round(process.uptime())}s`,
      status: "🧠 AI Backend Healthy",
    });
  } catch (err) {
    res.status(500).json({ status: "❌ Health check failed", error: err.message });
  }
});

/* -------------------------------------------
   🌐 Root route for quick health check
------------------------------------------- */
app.get("/", (req, res) => {
  res.send("🚀 Smart Inventory AI API Running");
});

/* -------------------------------------------
   🚀 Start the backend server
------------------------------------------- */
const server = app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
  console.log(`🔑 Groq Key Loaded: ${!!process.env.GROQ_API_KEY}`);
});

/* -------------------------------------------
   🧹 Graceful shutdown (no callback error)
------------------------------------------- */
process.on("SIGINT", async () => {
  console.log("🛑 Server closed gracefully");
  await mongoose.connection.close();
  process.exit(0);
});
