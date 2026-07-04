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

const errors = new Rate("errors")

// SMOKE mode = tiny, safe first run (5 users for 30s) to confirm it works.
// Full mode  = ramp 10 → 25 → 50 → 100 concurrent users to find the ceiling.
// Turn smoke on with:  $env:SMOKE="1"
const SMOKE = __ENV.SMOKE === "1"

export const options = SMOKE
  ? {
      vus: 5,
      duration: "30s",
      thresholds: { http_req_duration: ["p(95)<2500"], errors: ["rate<0.05"] },
    }
  : {
      stages: [
        { duration: "30s", target: 10 },
        { duration: "1m",  target: 25 },
        { duration: "1m",  target: 50 },
        { duration: "1m",  target: 100 },
        { duration: "30s", target: 0 },
      ],
      thresholds: {
        http_req_duration: ["p(95)<2500"], // 95% of requests under 2.5s
        errors:            ["rate<0.03"],  // fewer than 3% errors
      },
    }

const params = { headers: { Cookie: `lms_session=${COOKIE}` } }

export default function () {
  // 1) Dashboard — the heaviest common student page (several DB queries)
  let res = http.get(`${BASE}/lms/dashboard`, params)
  check(res, { "dashboard ok": (r) => r.status === 200 }) || errors.add(1)
  sleep(1)

  // 2) My Courses list
  res = http.get(`${BASE}/lms/courses`, params)
  check(res, { "courses ok": (r) => r.status === 200 }) || errors.add(1)
  sleep(1)

  // 3) A specific course page (module list + progress)
  if (COURSE_ID) {
    res = http.get(`${BASE}/lms/courses/${COURSE_ID}`, params)
    check(res, { "course ok": (r) => r.status === 200 }) || errors.add(1)
    sleep(2)
  }
}
