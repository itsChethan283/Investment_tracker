require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();

// Allow localhost in dev and the real Vercel URL in production.
// Set FRONTEND_URL env var on Railway/Render to your Vercel domain.
const allowedOrigins = [
  "http://localhost:5173",
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      // allow non-browser requests (curl, health checks) and listed origins
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      cb(new Error(`CORS blocked for origin: ${origin}`));
    },
  })
);
app.use(express.json());

// ── Mongoose schemas ──────────────────────────────────────────────────────────
// "history" collection — individual investment transactions
const investmentSchema = new mongoose.Schema(
  {
    date: { type: String, required: true },         // "YYYY-MM-DD"
    type: { type: String, enum: ["Chit", "Stocks", "MF"], required: true },
    amount: { type: Number, required: true, min: 1 },
  },
  { collection: "history" }
);

// "dashboard" collection — one summary doc per investment type
const summarySchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["Chit", "Stocks", "MF"], unique: true },
    total: { type: Number, default: 0 },
  },
  { collection: "dashboard" }
);

const Investment = mongoose.model("Investment", investmentSchema);
const Summary    = mongoose.model("Summary", summarySchema);

// ── Seed helper (runs once if history is empty) ───────────────────────────────
async function seedIfEmpty() {
  const count = await Investment.countDocuments();
  if (count > 0) return;

  console.log("Empty DB detected — seeding initial data…");

  const today = new Date();
  const FIXED = {
    Chit:   [5000,5000,5000,5000,5000,5000,5000,5000,5000,5000,5000,5000],
    Stocks: [15000,0,20000,0,12000,0,18000,0,25000,0,10000,30000],
    MF:     [8000,8000,8000,8000,8000,8000,8000,8000,8000,8000,8000,8000],
  };

  const entries = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 10);
    const dateStr = d.toISOString().split("T")[0];
    for (const type of ["Chit", "Stocks", "MF"]) {
      const amt = FIXED[type][11 - i];
      if (amt > 0) entries.push({ date: dateStr, type, amount: amt });
    }
  }

  await Investment.insertMany(entries);

  // Rebuild dashboard summaries from seeded data
  for (const type of ["Chit", "Stocks", "MF"]) {
    const total = entries
      .filter((e) => e.type === type)
      .reduce((s, e) => s + e.amount, 0);
    await Summary.findOneAndUpdate(
      { type },
      { $set: { total } },
      { upsert: true }
    );
  }

  console.log(`Seeded ${entries.length} investment entries.`);
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/investments — all history entries, sorted oldest first
app.get("/api/investments", async (req, res) => {
  try {
    const investments = await Investment.find().sort({ date: 1, _id: 1 }).lean();
    res.json(investments.map((inv) => ({ ...inv, id: inv._id.toString() })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch investments" });
  }
});

// POST /api/investments — add a new entry, update dashboard summary
app.post("/api/investments", async (req, res) => {
  try {
    const { date, type, amount } = req.body;
    if (!date || !type || !amount || amount <= 0) {
      return res.status(400).json({ error: "Invalid payload" });
    }

    const inv = await Investment.create({ date, type, amount });

    // Keep dashboard summary in sync
    await Summary.findOneAndUpdate(
      { type },
      { $inc: { total: amount } },
      { upsert: true }
    );

    res.status(201).json({ ...inv.toObject(), id: inv._id.toString() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to save investment" });
  }
});

// GET /api/summary — per-type totals from dashboard collection
app.get("/api/summary", async (req, res) => {
  try {
    const summaries = await Summary.find().lean();
    const result = { Chit: 0, Stocks: 0, MF: 0 };
    summaries.forEach(({ type, total }) => { result[type] = total; });
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch summary" });
  }
});

// ── Connect & start ───────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;

mongoose
  .connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log("✅  Connected to MongoDB Atlas (dashboard)");
    await seedIfEmpty();
    app.listen(PORT, () =>
      console.log(`🚀  Backend listening on http://localhost:${PORT}`)
    );
  })
  .catch((err) => {
    console.error("❌  MongoDB connection failed:", err.message);
    process.exit(1);
  });
