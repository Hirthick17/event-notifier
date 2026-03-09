/**
 * moodleRoutes.js – Express routes for VIT Chennai LMS (session-based scraping)
 *
 * Endpoints:
 *   GET  /moodle/ping          – login test + user info from dashboard
 *   GET  /moodle/courses       – enrolled courses (scraped from /my/)
 *   GET  /moodle/assignments   – all assignments with title, subject, deadline, instructions
 *   POST /moodle/logout        – clears cached session (forces re-login)
 */

const express = require("express");
const router  = express.Router();
const moodle  = require("./moodle");

// GET /moodle/ping – connectivity and login verification
router.get("/ping", async (req, res) => {
  try {
    const info = await moodle.getSiteInfo();
    res.json({ ok: true, message: "Connected to VIT Chennai LMS", ...info });
  } catch (err) {
    console.error("[route] /ping error:", err.message);
    res.status(502).json({ ok: false, error: err.message });
  }
});

// GET /moodle/courses – enrolled courses for the logged-in user
router.get("/courses", async (req, res) => {
  try {
    const courses = await moodle.getEnrolledCourses();
    res.json({ count: courses.length, courses });
  } catch (err) {
    console.error("[route] /courses error:", err.message);
    res.status(502).json({ error: err.message });
  }
});

// GET /moodle/assignments – all assignments across all courses
router.get("/assignments", async (req, res) => {
  try {
    const assignments = await moodle.getFormattedAssignments();
    res.json({ count: assignments.length, assignments });
  } catch (err) {
    console.error("[route] /assignments error:", err.message);
    res.status(502).json({ error: err.message });
  }
});

// POST /moodle/logout – invalidate cached session
router.post("/logout", (req, res) => {
  moodle.logout();
  res.json({ ok: true, message: "Session cleared – will re-login on next request" });
});

module.exports = router;
