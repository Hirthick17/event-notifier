/**
 * moodle.js – VIT Chennai LMS integration
 *
 * Strategy:
 *  1. Form-POST login → capture MoodleSession + cookiesession1 cookies
 *  2. Fetch /my/ dashboard → extract sesskey + userid from M.cfg (JS config)
 *  3. Call POST /lib/ajax/service.php?sesskey=XXX  (always-on internal AJAX)
 *     to get enrolled courses and assignment data as clean JSON.
 *
 * Required env vars (backend/.env):
 *   MOODLE_URL      = https://lms.vit.ac.in
 *   MOODLE_USERNAME = e.g. 24BRS1281
 *   MOODLE_PASSWORD = your VIT password
 */

const cheerio = require("cheerio");
const fetch   = require("node-fetch");
const https   = require("https");

// Bypass VIT's institutional SSL certificate issues
const agent = new https.Agent({ rejectUnauthorized: false });

const MOODLE_URL      = (process.env.MOODLE_URL      || "").replace(/\/$/, "");
const MOODLE_USERNAME = process.env.MOODLE_USERNAME   || "";
const MOODLE_PASSWORD = process.env.MOODLE_PASSWORD   || "";

// Session state – populated once after login
let _session = null; // { cookies, sesskey, userid }

// ── Cookie helpers ────────────────────────────────────────────────────────────

function parseCookies(headers) {
  const raw = (headers.raw ? headers.raw() : {})["set-cookie"] || [];
  return raw.map((c) => c.split(";")[0]);    // array of "name=value"
}

function cookieString(arr) {
  return arr.filter(Boolean).join("; ");
}

function mergeCookieArrays(existing, fresh) {
  const map = new Map();
  for (const c of [...existing, ...fresh]) {
    const key = c.split("=")[0].trim();
    if (key) map.set(key, c.trim());
  }
  return [...map.values()];
}

// ── Low-level fetch with cookies ──────────────────────────────────────────────

async function get(url, cookieArr = []) {
  console.log("[moodle] → GET", url);
  return fetch(url, {
    redirect: "manual",
    agent,
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Cookie":     cookieString(cookieArr),
    },
  });
}

async function post(url, body, cookieArr = [], extraHeaders = {}) {
  console.log("[moodle] → POST", url);
  return fetch(url, {
    method: "POST",
    redirect: "manual",
    agent,
    headers: {
      "User-Agent":   "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Cookie":       cookieString(cookieArr),
      ...extraHeaders,
    },
    body,
  });
}

// ── Login ─────────────────────────────────────────────────────────────────────

async function login() {
  if (_session) {
    console.log("[moodle] ✔ Using cached session (sesskey:", _session.sesskey + ")");
    return _session;
  }

  console.log("[moodle] ─────────────────────────────────────────────────────");
  console.log("[moodle] 🔐 Logging in to:", MOODLE_URL);
  console.log("[moodle]    Username:", MOODLE_USERNAME);

  if (!MOODLE_URL || !MOODLE_USERNAME || !MOODLE_PASSWORD) {
    throw new Error("Set MOODLE_URL, MOODLE_USERNAME, MOODLE_PASSWORD in .env");
  }

  let cookies = [];

  // ── Step 1: GET /login/index.php  →  collect initial cookies + logintoken ──
  const r1 = await get(`${MOODLE_URL}/login/index.php`);
  cookies   = mergeCookieArrays(cookies, parseCookies(r1.headers));
  console.log("[moodle]    Step 1 status:", r1.status, "| cookies so far:", cookieString(cookies) || "(none)");

  // If redirected, follow once to get the actual login form
  let loginHtml = "";
  if (r1.status === 200) {
    loginHtml = await r1.text();
  } else {
    const loc = r1.headers.get("location") || `${MOODLE_URL}/login/index.php`;
    const r1b = await get(loc, cookies);
    cookies   = mergeCookieArrays(cookies, parseCookies(r1b.headers));
    loginHtml = await r1b.text();
  }

  const $ = cheerio.load(loginHtml);
  const logintoken = $('input[name="logintoken"]').val() || "";
  console.log("[moodle]    logintoken:", logintoken ? "found ✔" : "not found");

  // ── Step 2: POST credentials ──────────────────────────────────────────────
  const formBody = new URLSearchParams({
    username:   MOODLE_USERNAME,
    password:   MOODLE_PASSWORD,
    logintoken,
    anchor:     "",
  });

  const r2  = await post(
    `${MOODLE_URL}/login/index.php`,
    formBody.toString(),
    cookies,
    { "Content-Type": "application/x-www-form-urlencoded" }
  );
  const r2Cookies  = parseCookies(r2.headers);
  const r2Location = r2.headers.get("location") || "";
  cookies          = mergeCookieArrays(cookies, r2Cookies);

  console.log("[moodle]    Step 2 status:", r2.status, "→", r2Location || "(no redirect)");
  console.log("[moodle]    New cookies:", cookieString(r2Cookies) || "(none)");

  // ── Step 3: Follow testsession redirect with cookies ──────────────────────
  // Moodle redirects to ?testsession=N to verify cookie storage
  if (r2Location.includes("testsession=")) {
    console.log("[moodle]    Following testsession check:", r2Location);
    const r3  = await get(r2Location, cookies);
    const r3c = parseCookies(r3.headers);
    const r3l = r3.headers.get("location") || "";
    cookies   = mergeCookieArrays(cookies, r3c);
    console.log("[moodle]    Step 3 status:", r3.status, "→", r3l || "(no redirect)");

    // Follow once more if still redirecting (e.g. to /my/)
    if (r3l && !r3l.includes("testsession")) {
      const r4  = await get(r3l, cookies);
      cookies   = mergeCookieArrays(cookies, parseCookies(r4.headers));
      console.log("[moodle]    Step 4 status:", r4.status);
    }
  }

  const hasMoodleSession = cookies.some((c) => c.startsWith("MoodleSession="));
  if (!hasMoodleSession) {
    console.error("[moodle] ✖ No MoodleSession cookie after login");
    throw new Error("Login failed – check MOODLE_USERNAME and MOODLE_PASSWORD");
  }

  console.log("[moodle] ✔ Authentication cookies obtained:", cookieString(cookies));

  // ── Step 4: Fetch /my/ dashboard → extract sesskey and userid ────────────
  console.log("[moodle]    Fetching dashboard to extract sesskey...");
  const dashRes  = await fetch(`${MOODLE_URL}/my/`, {
    agent,
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Cookie":     cookieString(cookies),
    },
  });
  const dashHtml = await dashRes.text();
  cookies        = mergeCookieArrays(cookies, parseCookies(dashRes.headers));

  // M.cfg.sesskey and M.cfg.userid are embedded in every Moodle page
  const sesskeyMatch = dashHtml.match(/"sesskey"\s*:\s*"([^"]+)"/);
  const useridMatch  = dashHtml.match(/"userid"\s*:\s*(\d+)/);
  const sesskey = sesskeyMatch ? sesskeyMatch[1] : "";
  const userid  = useridMatch  ? Number(useridMatch[1]) : 0;

  if (!sesskey) {
    console.error("[moodle] ✖ Could not extract sesskey from dashboard");
    throw new Error("Could not extract sesskey – login may have failed silently");
  }

  console.log("[moodle] ✔ sesskey:", sesskey);
  console.log("[moodle] ✔ userid:", userid);
  console.log("[moodle] ─────────────────────────────────────────────────────");

  _session = { cookies, sesskey, userid, dashHtml }; // cache dashboard HTML
  return _session;
}

/** Clear session (force re-login on next request) */
function logout() {
  console.log("[moodle] ⚠ Session cleared – will re-login on next request");
  _session = null;
}

// ── AJAX service caller ───────────────────────────────────────────────────────

/**
 * Call Moodle's internal AJAX service endpoint.
 * @param {string} methodname  e.g. "core_enrol_get_users_courses"
 * @param {object} args        arguments for the method
 */
async function ajaxCall(methodname, args = {}) {
  const { cookies, sesskey } = await login();

  const url     = `${MOODLE_URL}/lib/ajax/service.php?sesskey=${sesskey}&info=${methodname}`;
  const payload = JSON.stringify([{ index: 0, methodname, args }]);

  console.log(`[moodle] → AJAX ${methodname}`);

  const res  = await fetch(url, {
    method: "POST",
    agent,
    headers: {
      "Content-Type":    "application/json",
      "X-Requested-With": "XMLHttpRequest",
      "Accept":          "application/json, text/javascript, */*; q=0.01",
      "Origin":          MOODLE_URL,
      "Referer":         `${MOODLE_URL}/my/`,
      "User-Agent":      "Mozilla/5.0",
      "Cookie":          cookieString(cookies),
    },
    body: payload,
  });

  const json = await res.json();
  if (!Array.isArray(json) || json[0]?.error) {
    console.error(`[moodle] ✖ AJAX error for ${methodname}:`, JSON.stringify(json[0]));
    throw new Error(json[0]?.error || "AJAX call failed");
  }

  console.log(`[moodle] ✔ ${methodname} OK`);
  return json[0].data;
}

// ── Public helpers ────────────────────────────────────────────────────────────

/** Site info + logged-in user from session state */
async function getSiteInfo() {
  console.log("[moodle] ── getSiteInfo");
  const { sesskey, userid } = await login();
  return {
    siteUrl:  MOODLE_URL,
    siteName: "VIT Chennai LMS",
    userId:   userid,
    sesskey,
  };
}

/** Enrolled courses — fetched via Moodle's internal AJAX API */
async function getEnrolledCourses() {
  console.log("[moodle] ── getEnrolledCourses: calling AJAX API...");
  try {
    const data = await ajaxCall("core_course_get_enrolled_courses_by_timeline_classification", {
      classification: "all",
      limit: 0,
      offset: 0,
      sort: "fullname"
    });
    
    if (!data || !data.courses) {
      throw new Error("No courses returned from AJAX call");
    }

    const courses = data.courses.map(c => ({
      id: c.id.toString(),
      fullName: c.fullname,
      shortName: c.shortname,
      category: c.coursecategory
    }));

    console.log(`[moodle] ✔ Found ${courses.length} course(s) from API:`);
    courses.forEach((c) => console.log(`         • [${c.id}] ${c.fullName}`));
    return courses;
  } catch (error) {
    console.error("[moodle] ✖ Error fetching enrolled courses:", error.message);
    throw error;
  }
}

/**
 * Scrape assignment details from a course's assignments page.
 * Falls back to HTML scraping since mod_assign methods are WS-only.
 */
async function scrapeAssignmentsForCourse(courseId, courseName) {
  console.log(`[moodle]    Scraping assignments for [${courseId}] "${courseName}"...`);
  const { cookies } = await login();

  const res  = await fetch(`${MOODLE_URL}/course/view.php?id=${courseId}`, {
    agent,
    headers: { "User-Agent": "Mozilla/5.0", Cookie: cookieString(cookies) },
  });
  const html  = await res.text();
  const $     = cheerio.load(html);
  const links = [];

  $('a[href*="/mod/assign/view.php"]').each((_, el) => {
    const href    = $(el).attr("href") || "";
    const idMatch = href.match(/id=(\d+)/);
    const title   = $(el).text().trim();
    if (idMatch && title) links.push({ id: idMatch[1], title, href });
  });

  console.log(`           → ${links.length} assignment link(s) found`);

  const results = [];
  for (const link of links) {
    const detail = await scrapeAssignmentDetail(link, courseId, courseName);
    results.push(detail);
  }
  return results;
}

async function scrapeAssignmentDetail(link, courseId, courseName) {
  console.log(`           Fetching: "${link.title}"`);
  const { cookies } = await login();

  const res  = await fetch(`${MOODLE_URL}/mod/assign/view.php?id=${link.id}`, {
    agent,
    headers: { "User-Agent": "Mozilla/5.0", Cookie: cookieString(cookies) },
  });
  const html = await res.text();
  const $    = cheerio.load(html);

  // Due date row in the submission status table
  let deadline = null;
  $(".submissionstatustable tr, .generaltable tr").each((_, row) => {
    const label = $(row).find("td").first().text().toLowerCase();
    if (label.includes("due date") || label.includes("due")) {
      const val = $(row).find("td").last().text().trim();
      if (val && val !== "-") {
        const parsed = new Date(val);
        deadline = isNaN(parsed) ? val : parsed.toISOString();
      }
    }
  });

  const instructions = $(".box.generalbox, #intro")
    .first().text().replace(/\s+/g, " ").trim()
    .substring(0, 600) || "No instructions provided";

  const result = {
    id:           link.id,
    title:        link.title,
    subject:      courseName,
    courseId,
    deadline,
    instructions,
    url:          `${MOODLE_URL}/mod/assign/view.php?id=${link.id}`,
  };

  console.log(`           ✔ "${result.title}" | Due: ${result.deadline || "not set"}`);
  return result;
}

/** Fetch all upcoming assignments across all enrolled courses via AJAX */
async function getFormattedAssignments() {
  console.log("[moodle] ── getFormattedAssignments: fetching upcoming events via AJAX...");
  
  try {
    // core_calendar_get_action_events_by_timesort returns upcoming actionable events (like assignments)
    // timesortfrom: current time down to the second
    const data = await ajaxCall("core_calendar_get_action_events_by_timesort", {
      timesortfrom: Math.floor(Date.now() / 1000),
      limitnum: 50 // Fetch up to 50 upcoming deadlines
    });

    if (!data || !data.events) {
      console.log("[moodle] ✔ No upcoming assignments found.");
      return [];
    }

    // Map Moodle's JSON event structure to our application's expected format
    const formatted = data.events.map(event => {
      // event.timesort is a Unix timestamp in seconds
      const deadlineDate = new Date(event.timesort * 1000);
      
      return {
        id: event.instance, // Map to the assignment ID
        title: event.name,
        subject: event.course ? event.course.fullname : "Unknown Course",
        courseId: event.course ? event.course.id : null,
        deadline: deadlineDate.toISOString(),
        instructions: event.description || "No instructions provided",
        url: event.url
      };
    });

    console.log(`[moodle] ✔ Successfully fetched and parsed ${formatted.length} upcoming assignment(s) via JSON.`);
    return formatted;
  } catch (err) {
    console.error(`[moodle] ✖ Failed to fetch assignments via AJAX: ${err.message}`);
    throw err;
  }
}

module.exports = {
  login,
  logout,
  ajaxCall,
  getSiteInfo,
  getEnrolledCourses,
  getFormattedAssignments,
};
