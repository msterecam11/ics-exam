// ─────────────────────────────────────────────────────────────────────────────
// k6 load test for the ICS LMS on Render (512 MB / 0.5 CPU Starter plan).
//
// It simulates N concurrent students browsing the portal as an authenticated
// user, ramping the load up in stages, and reports p95 latency + error rate so
// you can see the point where the instance starts to struggle.
//
// WHY A COOKIE (and not username/password)?
//   The student login enforces Cloudflare Turnstile in production, which a load
//   test can't solve. So instead: log in once in your browser, copy the session
//   cookie, and this test reuses it to hammer the authenticated pages — which is
//   the realistic load anyway (SSR page renders + DB reads).
//
// ─── HOW TO RUN ──────────────────────────────────────────────────────────────
// 1. Install k6:  https://k6.io/docs/get-started/installation/
//      Windows:  winget install k6   (or  choco install k6)
//
// 2. Get your session cookie:
//      - Log in to your deployed LMS as a student in Chrome.
//      - F12 → Application tab → Cookies → your site → copy the VALUE of
//        the cookie named "lms_session".
//
// 3. Find a real course id (from the URL when you open a course):
//        /lms/courses/<THIS-PART>
//
// 4. Run it (PowerShell):
//      $env:BASE_URL="https://YOUR-APP.onrender.com"
//      $env:LMS_COOKIE="paste-the-cookie-value"
//      $env:COURSE_ID="paste-a-course-id"
//      k6 run loadtest/k6-lms.js
//
// 5. WHILE it runs, watch Render → your service → Metrics (Memory + CPU).
//      If memory nears 512 MB or you see "exit code 137" in Logs → that's your
//      ceiling (the instance ran out of RAM and restarted).
// ─────────────────────────────────────────────────────────────────────────────

import http from "k6/http"
import { check, sleep } from "k6"
import { Rate } from "k6/metrics"

const BASE      = __ENV.BASE_URL   || "http://localhost:3000"
const COOKIE    = __ENV.LMS_COOKIE || ""
const COURSE_ID = __ENV.COURSE_ID  || ""
// Optional — makes the test navigate REAL course content like a student:
const MODULE_ID      = __ENV.MODULE_ID  || ""   // a package module's id (/lms/courses/<c>/package/<THIS>)
const PACKAGE_ID     = __ENV.PACKAGE_ID || ""   // that module's package id — needed for progress calls
const ITEM_ID        = __ENV.ITEM_ID    || ""   // an item id — completing it triggers the heavy progress sync
const EXAM_MODULE_ID = __ENV.EXAM_MODULE_ID || "" // the final-exam module id — opens the exam PAGE (no submit)
const WRITE          = __ENV.WRITE === "1" && PACKAGE_ID // save progress (writes data — use a test student!)

const errors = new Rate("errors")

// FOUR ways to run:
//   SMOKE mode  →  5 users for 30s (safe first check):        $env:SMOKE="1"
//   FIXED mode  →  exactly N users hammering for a set time:  $env:VUS="20"
//   SOAK mode   →  N users pacing like REAL students (long    $env:SOAK="1"
//                  reading pauses) for a long duration —          (default 45m,
//                  reveals memory creep / leaks over time:        set $env:DURATION="3h" for a full day)
//   RAMP mode   →  10→25→50→100 to find the ceiling:          (default, no env var)
const SMOKE = __ENV.SMOKE === "1"
const SOAK  = __ENV.SOAK  === "1"
const VUS      = __ENV.VUS ? parseInt(__ENV.VUS) : null
const DURATION = __ENV.DURATION || (SOAK ? "45m" : "2m")

const thresholds = {
  http_req_duration: ["p(95)<2500"], // 95% of requests under 2.5s
  errors:            ["rate<0.03"],  // fewer than 3% errors
}

export const options = SMOKE
  ? { vus: 5, duration: "30s", thresholds: { ...thresholds, errors: ["rate<0.05"] } }
  : SOAK
  ? { vus: VUS || 20, duration: DURATION, thresholds: { errors: ["rate<0.03"] } } // stability over speed
  : VUS
  ? { vus: VUS, duration: DURATION, thresholds }
  : {
      stages: [
        { duration: "30s", target: 10 },
        { duration: "1m",  target: 25 },
        { duration: "1m",  target: 50 },
        { duration: "1m",  target: 100 },
        { duration: "30s", target: 0 },
      ],
      thresholds,
    }

// Reading pause: long & random in SOAK (like a real student), short otherwise.
function pause(short) {
  if (SOAK) { sleep(20 + Math.random() * 70) } // 20–90s of "reading"
  else { sleep(short) }
}

const params      = { headers: { Cookie: `lms_session=${COOKIE}` } }
const writeParams = { headers: { Cookie: `lms_session=${COOKIE}`, "Content-Type": "application/json" } }

function visit(path, name) {
  const res = http.get(`${BASE}${path}`, params)
  check(res, { [`${name} ok`]: (r) => r.status === 200 }) || errors.add(1)
  return res
}

// A full, realistic student session — covers the whole student surface.
// Reads are always safe; the progress WRITE only fires when WRITE=1.
export default function () {
  // ── 1. Land + navigate the portal ──────────────────────────────
  visit("/lms/dashboard", "dashboard"); pause(1)
  visit("/lms/courses",   "courses");   pause(1)

  if (COURSE_ID) { visit(`/lms/courses/${COURSE_ID}`, "course"); pause(2) }

  // ── 2. Enter a module and work through content ─────────────────
  if (MODULE_ID && COURSE_ID) {
    visit(`/lms/courses/${COURSE_ID}/package/${MODULE_ID}`, "package player"); pause(2)

    // The player loads saved progress on open
    if (PACKAGE_ID) http.get(`${BASE}/api/lms/packages/${PACKAGE_ID}/progress`, params)

    // Save progress — the WRITE path. With ITEM_ID it marks an item complete,
    // which fires syncEnrollmentProgress (the heaviest per-student DB work).
    // ⚠️ Writes to the cookie's account — use a THROWAWAY test student.
    if (WRITE) {
      const body = { module_id: MODULE_ID, course_id: COURSE_ID, time_spent: 30 }
      if (ITEM_ID) body.completed_item_id = ITEM_ID
      const res = http.post(`${BASE}/api/lms/packages/${PACKAGE_ID}/progress`, JSON.stringify(body), writeParams)
      check(res, { "progress save ok": (r) => r.status === 200 }) || errors.add(1)
      pause(1)
    }
  }

  // ── 3. Occasionally open the exam page (viewing it, not submitting) ──
  if (EXAM_MODULE_ID && COURSE_ID && Math.random() < 0.3) {
    visit(`/lms/courses/${COURSE_ID}/exam/${EXAM_MODULE_ID}`, "exam page"); pause(2)
  }

  // ── 4. Occasionally check the other student pages (like real browsing) ──
  if (Math.random() < 0.4) { visit("/lms/schedule",     "schedule");     pause(1) }
  if (Math.random() < 0.3) { visit("/lms/assignments",  "assignments");  pause(1) }
  if (Math.random() < 0.3) { visit("/lms/certificates", "certificates"); pause(1) }
  if (Math.random() < 0.2) { visit("/lms/profile",      "profile");      pause(1) }
}
