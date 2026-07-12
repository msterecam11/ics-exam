// ─────────────────────────────────────────────────────────────────────────────
// k6 load test for the EXAM SYSTEM on Render (512 MB / 0.5 CPU Starter plan).
//
// Simulates N candidates sitting an exam at the same time — the realistic
// worst case for a proctored session: everyone's take page open, question
// fetches, a steady drip of security events (tab switches etc.), and
// submits near the end.
//
// WHY PRE-CREATED CANDIDATES (not live registration)?
//   Registration is rate-limited to 10 per IP per 15 min. Real candidates
//   come from 20 different IPs; a load test comes from ONE. So the test
//   expects candidates created ahead of time (ask Claude / run SQL), and
//   each virtual user takes one candidate id from the list.
//
// ─── SETUP (once) ─────────────────────────────────────────────────────────────
// 1. Install k6:  winget install k6
// 2. Create a throwaway TEST exam (active, with questions) + 20 test
//    candidates registered to it. Collect:
//      EXAM_ID        – the exam's id
//      CANDIDATE_IDS  – comma-separated candidate ids (one per VU)
//
// ─── RECIPES (PowerShell) ─────────────────────────────────────────────────────
//    $env:BASE_URL="https://exam.ics-aviation.com"
//    $env:EXAM_ID="<exam id>"
//    $env:CANDIDATE_IDS="<id1>,<id2>,...,<id20>"
//
// A) Safe smoke test (5 users, 30s):
//      $env:SMOKE="1"; k6 run loadtest/k6-exam.js
//
// B) The 20-candidate exam sitting (the benchmark — default 20m, like a
//    short exam; set DURATION for longer):
//      $env:SMOKE="0"; $env:VUS="20"; $env:DURATION="20m"
//      k6 run loadtest/k6-exam.js
//
// C) Same but WITH submits at the end (⚠ marks the test candidates as
//    submitted — they can't be reused without resetting them):
//      $env:VUS="20"; $env:DURATION="20m"; $env:SUBMIT="1"
//      k6 run loadtest/k6-exam.js
//    NOTE: submits are rate-limited to 10/hour/IP — from one test machine,
//    ~10 will succeed and the rest get 429. That's the limiter working,
//    not the server failing, so 429 on submit isn't counted as an error.
//
// WHILE it runs: watch Render → Metrics (Memory + CPU). Memory nearing
// 512 MB or "exit code 137" in Logs = the instance ran out of RAM.
// ─────────────────────────────────────────────────────────────────────────────

import http from "k6/http"
import { check, sleep } from "k6"
import { Rate } from "k6/metrics"

const BASE          = __ENV.BASE_URL || "http://localhost:3000"
const EXAM_ID       = __ENV.EXAM_ID  || ""
const CANDIDATE_IDS = (__ENV.CANDIDATE_IDS || "").split(",").map(s => s.trim()).filter(Boolean)
const SUBMIT        = __ENV.SUBMIT === "1"

const errors = new Rate("errors")

const SMOKE    = __ENV.SMOKE === "1"
const VUS      = __ENV.VUS ? parseInt(__ENV.VUS) : 20
const DURATION = __ENV.DURATION || "20m"

const thresholds = {
  http_req_duration: ["p(95)<2500"], // 95% of requests under 2.5s
  errors:            ["rate<0.03"],  // fewer than 3% errors
}

export const options = SMOKE
  ? { vus: Math.min(5, CANDIDATE_IDS.length || 5), duration: "30s", thresholds: { ...thresholds, errors: ["rate<0.05"] } }
  : { vus: Math.min(VUS, CANDIDATE_IDS.length || VUS), duration: DURATION, thresholds }

const jsonParams = { headers: { "Content-Type": "application/json" } }

function visit(path, name) {
  const res = http.get(`${BASE}${path}`)
  const ok = check(res, { [`${name} ok`]: (r) => r.status === 200 })
  errors.add(!ok)
  return res
}

// Each VU is one candidate for the whole run (VU numbers are 1-based).
export default function () {
  const candidateId = CANDIDATE_IDS[(__VU - 1) % CANDIDATE_IDS.length]

  // ── 1. The take page (SSR render — the page every candidate has open) ──
  visit(`/exam/${EXAM_ID}/take`, "take page")
  sleep(1 + Math.random() * 2)

  // ── 2. Their own question set (bank exams: the frozen per-candidate
  //       draw; manual exams: the shared list) — refetched on reload ──
  const qRes = http.get(`${BASE}/api/exam/${EXAM_ID}/questions?candidate_id=${candidateId}`)
  const qOk = check(qRes, { "questions ok": (r) => r.status === 200 })
  errors.add(!qOk)
  sleep(2 + Math.random() * 3)

  // ── 3. Security events — the background chatter of a real sitting
  //       (tab switches, right clicks). Realistic drip, not a flood. ──
  if (Math.random() < 0.35) {
    const events = ["tab_switch", "right_click", "copy_paste"]
    const event = events[Math.floor(Math.random() * events.length)]
    const body = { event, timestamp: new Date().toISOString() }
    if (event === "tab_switch") body.duration = Math.floor(Math.random() * 30)
    const res = http.post(`${BASE}/api/candidates/${candidateId}/security`, JSON.stringify(body), jsonParams)
    // 429 here = the per-IP event limiter (120/h) doing its job from one
    // test IP; from 20 real IPs it wouldn't fire.
    check(res, { "security ok": (r) => r.status === 200 || r.status === 429 })
    errors.add(res.status !== 200 && res.status !== 429)
  }

  // ── 4. Landing page — a candidate refreshing / late arrivals ──
  if (Math.random() < 0.15) {
    visit(`/exam/${EXAM_ID}`, "landing page")
  }

  // ── 5. Submit (only when SUBMIT=1) — a small chance per iteration so
  //       submits trickle in like a real exam's final minutes ──
  if (SUBMIT && Math.random() < 0.02) {
    const res = http.post(`${BASE}/api/exams/${EXAM_ID}/submit`, JSON.stringify({
      candidate_id: candidateId,
      answers: {}, // empty answers — scores 0, but exercises the full scoring path
    }), jsonParams)
    // 400 "Already submitted" (this VU submitted earlier) and 429 (10/h/IP
    // limiter from a single test IP) are both expected, not server faults.
    check(res, { "submit ok": (r) => [200, 400, 429].includes(r.status) })
    errors.add(![200, 400, 429].includes(res.status))
  }

  // Thinking time between actions — a candidate reading a question.
  sleep(8 + Math.random() * 15)
}
