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
// ─── SETUP (once) ─────────────────────────────────────────────────────────────
// 1. Install k6:  winget install k6   (or see https://k6.io/docs)
// 2. Log in to the LMS as a student → F12 → Application → Cookies →
//    copy the VALUE of the "lms_session" cookie.
// 3. Gather the ids for a course (from URLs, or ask an admin/DB):
//    COURSE_ID, MODULE_ID (a package module), PACKAGE_ID, ITEM_ID(s), EXAM_MODULE_ID
//
// ─── RECIPES (PowerShell) ─────────────────────────────────────────────────────
// Set these once per window:
//    $env:BASE_URL="https://exam.ics-aviation.com"
//    $env:LMS_COOKIE="<lms_session value>"
//    $env:COURSE_ID="<course id>"
//    $env:MODULE_ID="<package module id>"
//    $env:PACKAGE_ID="<package id>"
//    $env:EXAM_MODULE_ID="<exam module id>"
//    $env:ITEM_ID="<item id>,<another item id>"   # comma-separated
//
// A) Safe smoke test (5 users, 30s):
//      $env:SMOKE="1"; k6 run loadtest/k6-lms.js
//
// B) Realistic soak, READ-only (20 users, set duration):
//      $env:SMOKE="0"; $env:SOAK="1"; $env:WRITE="0"; $env:DURATION="20m"
//      k6 run loadtest/k6-lms.js
//
// C) Realistic soak WITH progress saves (heaviest; ⚠ writes to the cookie's
//    account — use a THROWAWAY test student):
//      $env:SOAK="1"; $env:WRITE="1"; $env:DURATION="20m"
//      k6 run loadtest/k6-lms.js
//
// WHILE it runs: watch Render → Metrics (Memory + CPU). Memory nearing 512 MB
// or "exit code 137" in Logs = the instance ran out of RAM (your ceiling).
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
const ITEM_IDS       = (__ENV.ITEM_ID || "").split(",").map(s => s.trim()).filter(Boolean) // one or more item ids (comma-separated); each save completes one, triggering the heavy progress sync
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
const SMOKE  = __ENV.SMOKE  === "1"
const SOAK   = __ENV.SOAK   === "1"
const STRESS = __ENV.STRESS === "1"          // ramp up to find the ceiling
const MAXVUS = __ENV.MAXVUS ? parseInt(__ENV.MAXVUS) : 300 // top of the ramp
const VUS      = __ENV.VUS ? parseInt(__ENV.VUS) : null
const DURATION = __ENV.DURATION || (SOAK ? "45m" : "2m")

const thresholds = {
  http_req_duration: ["p(95)<2500"], // 95% of requests under 2.5s
  errors:            ["rate<0.03"],  // fewer than 3% errors
}

// STRESS ramp: climb in steps (each held 90s so you can watch each level on
// Render), up to MAXVUS. The level where p95 spikes / errors climb / memory
// hits 512 MB is your ceiling.
const stressStages = [25, 50, 75, 100, 150, 200, 250, 300, 400, 500]
  .filter(n => n <= MAXVUS)
  .map(target => ({ duration: "90s", target }))
stressStages.push({ duration: "30s", target: 0 })

export const options = SMOKE
  ? { vus: 5, duration: "30s", thresholds: { ...thresholds, errors: ["rate<0.05"] } }
  : STRESS
  ? { stages: stressStages, thresholds: { errors: ["rate<0.10"] } } // just observe; don't fail early
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

// Reading pause between clicks:
//   SOAK   → 20–90s (a real student reading a page)
//   STRESS → 3–8s   (an ENGAGED student actively working through content)
//   else   → the passed short value
function pause(short) {
  if (SOAK)        { sleep(20 + Math.random() * 70) }
  else if (STRESS) { sleep(3 + Math.random() * 5) }
  else             { sleep(short) }
}

const params      = { headers: { Cookie: `lms_session=${COOKIE}` } }
const writeParams = { headers: { Cookie: `lms_session=${COOKIE}`, "Content-Type": "application/json" } }

function visit(path, name) {
  const res = http.get(`${BASE}${path}`, params)
  const ok = check(res, { [`${name} ok`]: (r) => r.status === 200 })
  errors.add(!ok) // record EVERY request (true rate), not just failures
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
      if (ITEM_IDS.length) body.completed_item_id = ITEM_IDS[Math.floor(Math.random() * ITEM_IDS.length)]
      const res = http.post(`${BASE}/api/lms/packages/${PACKAGE_ID}/progress`, JSON.stringify(body), writeParams)
      const ok = check(res, { "progress save ok": (r) => r.status === 200 })
      errors.add(!ok)
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
