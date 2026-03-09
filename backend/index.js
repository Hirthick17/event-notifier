require("dotenv").config();
const express = require("express");
const cors = require("cors");
const moodleRoutes = require("./moodleRoutes");


const app = express();
app.use(cors());
app.use(express.json());

// ─── Moodle LMS routes ───────────────────────────────────────────────────────
app.use("/moodle", moodleRoutes);
// ─────────────────────────────────────────────────────────────────────────────

// ─── In-memory DB (swap for SQLite/Postgres easily) ──────────────────────────
let events = [
  { id: 1, title: "Reforge", date: "2026-03-09", time: "08:00", category: "social", notify: true, note: "Open Source Programming Club Showcase. Ends at 4:00 PM." },
  { id: 2, title: "Annual Hackathon Info Session", date: "2026-03-12", time: "18:00", category: "work", notify: true, note: "Google Developer Student Club (GDSC)" },
  { id: 3, title: "Dance Workshop", date: "2026-03-15", time: "16:00", category: "social", notify: false, note: "ABCD (Any Body Can Dance) Club" },
  { id: 4, title: "Blood Donation Drive", date: "2026-03-18", time: "10:00", category: "health", notify: true, note: "Youth Red Cross (YRC)" },
];
let nextId = 5;
// ─────────────────────────────────────────────────────────────────────────────

app.get("/events", (req, res) => {
  const sorted = [...events].sort(
    (a, b) => new Date(`${a.date}T${a.time}`) - new Date(`${b.date}T${b.time}`)
  );
  res.json(sorted);
});

app.post("/events", (req, res) => {
  const { title, date, time, category, notify, note } = req.body;
  if (!title || !date || !time)
    return res.status(400).json({ error: "title, date, and time are required" });
  const event = { id: nextId++, title, date, time, category: category || "other", notify: !!notify, note: note || "" };
  events.push(event);
  res.status(201).json(event);
});

app.patch("/events/:id/notify", (req, res) => {
  const event = events.find((e) => e.id === parseInt(req.params.id));
  if (!event) return res.status(404).json({ error: "Not found" });
  event.notify = !event.notify;
  res.json(event);
});

app.delete("/events/:id", (req, res) => {
  const idx = events.findIndex((e) => e.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ error: "Not found" });
  events.splice(idx, 1);
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`notifi backend running on http://localhost:${PORT}`));
