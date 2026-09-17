// Deploy-day retake test (enrollment-based records).
//
// Run AFTER supabase/deploy/enrollment_records/02_swap.sql, against a local dev
// server (npm run dev) on the same database, with ONLY isolated test data:
//   1. fixtures.sql   (temp admin + ZZ TEST courses)
//   2. AFTER_SWAP=1 node scripts/deploy-checks/retake_e2e.mjs
//      (without AFTER_SWAP it's a trial run for before the switch: the retake
//       must then be refused cleanly, with nothing changed)
//   3. cleanup.sql    (removes every test row; stops if anything real is linked)
//
// It proves a student can take the same course again in a later program while
// the first run — progress, exam attempts, certificate, report — stays exactly
// as it was.
import { createRequire } from "module"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const PROJECT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const require = createRequire(path.join(PROJECT, "package.json"))
const { createClient } = require("@supabase/supabase-js")
for (const line of fs.readFileSync(path.join(PROJECT, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "")
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const BASE = process.env.BASE_URL ?? "http://localhost:3000"
const day = n => new Date(Date.now() + 3 * 3600_000 + n * 86400_000).toISOString().slice(0, 10)

let pass = 0, fail = 0
const check = (name, ok, detail) => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && detail !== undefined ? "  → " + JSON.stringify(detail).slice(0, 400) : ""}`) }

function client() {
  const jar = new Map()
  const store = res => { for (const c of res.headers.getSetCookie?.() ?? []) { const [kv] = c.split(";"); const i = kv.indexOf("="); jar.set(kv.slice(0, i).trim(), kv.slice(i + 1)) } }
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ")
  return {
    async req(method, p, body, opts = {}) {
      const res = await fetch(BASE + p, {
        method, redirect: "manual",
        headers: { cookie: cookie(), ...(body !== undefined ? { "content-type": opts.form ? "application/x-www-form-urlencoded" : "application/json" } : {}) },
        body: body === undefined ? undefined : opts.form ? new URLSearchParams(body).toString() : JSON.stringify(body),
      })
      store(res)
      const text = await res.text()
      let json; try { json = JSON.parse(text) } catch { json = text }
      return { status: res.status, data: json }
    },
  }
}
const html = r => (typeof r.data === "string" ? r.data : "").replace(/<!-- -->/g, "")

// Refuse to run against anything but the isolated fixtures.
const { data: courses } = await db.from("lms_courses").select("id, title").like("title", "ZZ TEST Course %")
if (!courses?.length) { console.log("Fixtures missing — run fixtures.sql first."); process.exit(1) }
const A = courses.find(c => c.title.startsWith("ZZ TEST Course A")).id
const { data: pkg } = await db.from("lms_packages").select("id, lms_package_items(id)").eq("course_id", A).single()
const { data: exam } = await db.from("lms_modules").select("id").eq("course_id", A).eq("module_type", "final_exam").single()

const admin = client()
{
  const { data: csrf } = await admin.req("GET", "/api/auth/csrf")
  await admin.req("POST", "/api/auth/callback/credentials", { csrfToken: csrf.csrfToken, email: "pm.admin.temp@icsaviation.test", password: "PmTestAdmin!2026x", json: "true" }, { form: true })
  check("admin signs in", (await admin.req("GET", "/api/auth/session")).data?.user?.role === "admin")
}

// ── Setup: one student, program P1 with course A ──
const co = await admin.req("POST", "/api/lms/companies", { name: "ZZ Test Co", code: "ZZTEST" })
const st = await admin.req("POST", "/api/lms/students", { name: "ZZ Test Student 1", email: "pm.student1.temp@icsaviation.test", password: "PmTestStudent!2026", company_id: co.data.id, sendEmail: false })
check("test student created", st.status === 201, st)
const S1 = st.data.id

const mkProgram = async (name, start, end, courseId = A) => {
  const p = (await admin.req("POST", "/api/lms/programs", { name, company_id: co.data.id, structure: "course", start_date: start, end_date: end, certificate_auto_release: true })).data
  if (courseId) await admin.req("POST", `/api/lms/programs/${p.id}/structure`, { action: "add_item", track_id: null, course_id: courseId })
  return p.id
}
const P1 = await mkProgram("ZZ TEST Program 2026", day(-30), day(30))
await admin.req("POST", `/api/lms/programs/${P1}/members`, { student_ids: [S1] })
check("P1 active", (await admin.req("PATCH", `/api/lms/programs/${P1}`, { status: "active" })).data?.status === "active")

const student = client()
check("student signs in", (await student.req("POST", "/api/lms/auth", { email: "pm.student1.temp@icsaviation.test", password: "PmTestStudent!2026" })).status === 200)

const d1 = (await admin.req("GET", `/api/lms/programs/${P1}`)).data
const m1 = d1.members.find(m => m.student_id === S1).id

async function finishCourse(label, answers) {
  for (const it of pkg.lms_package_items) await student.req("POST", `/api/lms/packages/${pkg.id}/progress`, { completed_item_id: it.id })
  const start = await student.req("POST", "/api/lms/exam-attempt/start", { module_id: exam.id, course_id: A })
  check(`${label}: exam starts`, start.status === 200, start)
  const sub = await student.req("POST", "/api/lms/exam-attempt", { module_id: exam.id, course_id: A, answers })
  check(`${label}: exam submitted`, sub.status === 200, sub)
  return sub.data
}

// ── Run 1 ──
const r1 = await finishCourse("run 1", { q1: "a", q2: "a", q3: "a" })
check("run 1: passed 100%", r1?.passed === true && r1?.pct === 100, r1)
const { data: e1 } = await db.from("lms_enrollments").select("id, status, completed_at, progress_pct").eq("student_id", S1).eq("course_id", A).single()
check("run 1: enrollment completed", e1?.status === "completed", e1)
const snapshot = async enrollmentId => {
  const [pp, att, cert] = await Promise.all([
    db.from("lms_package_progress").select("id, status, score, completed_items, updated_at").eq("enrollment_id", enrollmentId),
    db.from("lms_module_attempts").select("id, attempt_no, score, passed").eq("enrollment_id", enrollmentId).order("attempt_no"),
    db.from("lms_certificates").select("id, verification_code, released_at, revoked_at").eq("enrollment_id", enrollmentId),
  ])
  const { data: en } = await db.from("lms_enrollments").select("status, completed_at, progress_pct, program_id").eq("id", enrollmentId).single()
  return JSON.stringify({ en, pp: pp.data, att: att.data, cert: cert.data })
}
const before = await snapshot(e1.id)
check("run 1: certificate issued", JSON.parse(before).cert.length === 1, JSON.parse(before).cert)

// ── Transfer (independent of the switch) ──
{
  const B = courses.find(c => c.title.startsWith("ZZ TEST Course B")).id
  const C = courses.find(c => c.title.startsWith("ZZ TEST Course C")).id
  const mkStudent = async n => (await admin.req("POST", "/api/lms/students", { name: `ZZ Test Student ${n}`, email: `pm.student${n}.temp@icsaviation.test`, password: "PmTestStudent!2026", company_id: co.data.id, sendEmail: false })).data.id
  const activate = pid => admin.req("PATCH", `/api/lms/programs/${pid}`, { status: "active" })
  const memberIn = async (pid, sid) => (await admin.req("GET", `/api/lms/programs/${pid}`)).data.members.find(m => m.student_id === sid)

  // Transfer moves the enrollment with its progress.
  const S2 = await mkStudent(2)
  const T1 = await mkProgram("ZZ TEST Program Transfer From", day(-5), day(30), B); await activate(T1)
  const T2 = await mkProgram("ZZ TEST Program Transfer To", day(-5), day(30), B); await activate(T2)
  await admin.req("POST", `/api/lms/programs/${T1}/members`, { student_ids: [S2] })
  const { data: eB } = await db.from("lms_enrollments").select("id").eq("student_id", S2).eq("course_id", B).single()
  await db.from("lms_enrollments").update({ progress_pct: 40 }).eq("id", eB.id)
  const tr = await admin.req("PATCH", `/api/lms/programs/${T1}/members`, { member_id: (await memberIn(T1, S2)).id, action: "transfer", to_program_id: T2 })
  const { data: eBafter } = await db.from("lms_enrollments").select("id, program_id, progress_pct, status").eq("student_id", S2).eq("course_id", B)
  check("transfer: same enrollment moves to the new program with its progress", tr.status === 200 && eBafter.length === 1 && eBafter[0].id === eB.id && eBafter[0].program_id === T2 && Number(eBafter[0].progress_pct) === 40, { tr: tr.data, eBafter })
  check("transfer: old membership withdrawn, new one active", (await memberIn(T1, S2))?.status === "withdrawn" && (await memberIn(T2, S2))?.status === "active")

  // A transfer that can't enroll the student anywhere changes nothing.
  const S3 = await mkStudent(3)
  const U1 = await mkProgram("ZZ TEST Program Holds C", day(-5), day(30), C); await activate(U1)
  const U2 = await mkProgram("ZZ TEST Program Empty", day(-5), day(30), null); await activate(U2)
  const U3 = await mkProgram("ZZ TEST Program Also C", day(-5), day(30), C); await activate(U3)
  await admin.req("POST", `/api/lms/programs/${U1}/members`, { student_ids: [S3] })
  await admin.req("POST", `/api/lms/programs/${U2}/members`, { student_ids: [S3] })
  const bad = await admin.req("PATCH", `/api/lms/programs/${U2}/members`, { member_id: (await memberIn(U2, S3)).id, action: "transfer", to_program_id: U3 })
  check("transfer into a course already active elsewhere → refused, nothing changed", bad.status === 409 && /Nothing was changed/.test(bad.data?.error ?? "") && (await memberIn(U2, S3))?.status === "active" && !(await memberIn(U3, S3)), bad)
}

// ── Close P1, retake in P2 ──
check("P1 completed", (await admin.req("PATCH", `/api/lms/programs/${P1}`, { status: "completed" })).data?.status === "completed")
const P2 = await mkProgram("ZZ TEST Program 2028", day(-1), day(60))
check("P2 active", (await admin.req("PATCH", `/api/lms/programs/${P2}`, { status: "active" })).data?.status === "active")
const retake = await admin.req("PATCH", `/api/lms/programs/${P1}/members`, { member_id: m1, action: "retake", to_program_id: P2 })
const AFTER_SWAP = process.env.AFTER_SWAP === "1"
if (retake.status !== 200 && !AFTER_SWAP) console.log("INFO  retake refused:", retake.data?.error)
else check("retake into P2 creates a NEW enrollment", retake.status === 200 && retake.data?.sync?.created === 1 && !retake.data?.sync?.issues?.length, retake)
if (retake.status !== 200) {
  if (AFTER_SWAP) { console.log(`
${pass} passed, ${fail} failed — retake refused AFTER the switch: investigate before going further`); process.exit(1) }
  // Before 02_swap.sql the old one-per-student rule refuses the retake. Check
  // it was refused cleanly: nothing changed, the student still sees run 1.
  const { data: runsNow } = await db.from("lms_enrollments").select("id").eq("student_id", S1).eq("course_id", A)
  const { data: members } = await db.from("lms_program_members").select("program_id, status").eq("student_id", S1)
  check("refused retake changed nothing: one enrollment, still in P1 only", runsNow.length === 1 && members.length === 1 && members[0].program_id === P1 && members[0].status !== "withdrawn", { runsNow, members })
  check("refused retake: run 1 record untouched", (await snapshot(e1.id)) === before)
  const page = await student.req("GET", `/lms/courses/${A}`)
  check("refused retake: student still sees the completed course", page.status === 200 && html(page).includes("Completed"), page.status)
  console.log(`\n${pass} passed, ${fail} failed — retake refused (expected BEFORE 02_swap.sql; must pass after it)`)
  process.exit(0)
}

const { data: runs } = await db.from("lms_enrollments").select("id, status, program_id, progress_pct").eq("student_id", S1).eq("course_id", A)
const e2 = runs.find(r => r.program_id === P2)
check("two enrollments: run 1 completed (P1), run 2 active (P2) at 0%", runs.length === 2 && e2?.status === "active" && Number(e2?.progress_pct ?? 0) === 0 && runs.find(r => r.id === e1.id)?.status === "completed", runs)
check("run 1 record untouched after the retake", (await snapshot(e1.id)) === before)

// ── Student view ──
let page = await student.req("GET", `/lms/courses/${A}`)
let h = html(page)
check("course page: fresh 0%, P2 badge", page.status === 200 && h.includes("0% complete") && h.includes("ZZ TEST Program 2028"), page.status)
check("course page: Previous attempts shows run 1 (P1, passed 100%, certificate)", h.includes("Previous attempts") && h.includes("ZZ TEST Program 2026") && h.includes("Final exam passed · 100%") && h.includes("Certificate"))
check("package progress starts fresh", (await student.req("GET", `/api/lms/packages/${pkg.id}/progress`)).data === null)

// ── Run 2: fail once (attempt 1 of THIS run), then pass ──
const f2 = await finishCourse("run 2 try 1", { q1: "a", q2: "a", q3: "b" })
check("run 2: attempt counted as #1 of the new run, 67% fails", f2?.attempt_no === 1 && f2?.passed === false && f2?.pct === 67, f2)
const start2 = await student.req("POST", "/api/lms/exam-attempt/start", { module_id: exam.id, course_id: A })
const p2 = await student.req("POST", "/api/lms/exam-attempt", { module_id: exam.id, course_id: A, answers: { q1: "a", q2: "a", q3: "a" } })
check("run 2: second attempt passes", start2.status === 200 && p2.data?.passed === true && p2.data?.attempt_no === 2, p2)
const { data: e2done } = await db.from("lms_enrollments").select("status").eq("id", e2.id).single()
check("run 2: enrollment completed", e2done?.status === "completed", e2done)
const { data: certs } = await db.from("lms_certificates").select("enrollment_id, verification_code").eq("student_id", S1).eq("course_id", A)
check("two certificates, one per run, different numbers", certs?.length === 2 && new Set(certs.map(c => c.enrollment_id)).size === 2 && certs[0].verification_code !== certs[1].verification_code, certs)
check("run 1 record still untouched after run 2", (await snapshot(e1.id)) === before)

page = await student.req("GET", "/lms/certificates")
h = html(page)
check("certificates page: both programs listed", h.includes("ZZ TEST Program 2026") && h.includes("ZZ TEST Program 2028"))

// ── Admin views per run ──
const h1 = await admin.req("GET", `/api/lms/progress/${S1}/course/${A}?enrollment_id=${e1.id}`)
const h2 = await admin.req("GET", `/api/lms/progress/${S1}/course/${A}?enrollment_id=${e2.id}`)
check("admin detail: run 1 and run 2 load separately", h1.status === 200 && h2.status === 200 && h1.data?.enrollment?.id !== h2.data?.enrollment?.id, { s1: h1.status, s2: h2.status })
for (const p of [`/lms-admin/programs/${P1}`, `/lms-admin/programs/${P2}`, `/lms-admin/reports/${A}/${S1}/exam`]) {
  check(`admin page ${p.replace(/[0-9a-f-]{36}/g, ":id")}`, (await admin.req("GET", p)).status === 200)
}

// ── Still only ONE active enrollment per course ──
const P3 = await mkProgram("ZZ TEST Program Overlap", day(-1), day(60))
await admin.req("PATCH", `/api/lms/programs/${P3}`, { status: "active" })
await db.from("lms_enrollments").update({ status: "active", completed_at: null }).eq("id", e2.id)   // pretend run 2 is still going
const overlap = await admin.req("POST", `/api/lms/programs/${P3}/members`, { student_ids: [S1] })
check("adding to a 3rd program while active elsewhere → reported, not created", JSON.stringify(overlap.data).includes("Already active"), overlap.data)
const dup = await db.from("lms_enrollments").insert({ student_id: S1, course_id: A, status: "active", program_id: P3 })
check("database refuses a second ACTIVE enrollment", dup.error?.code === "23505", dup.error)

console.log(`\n${pass} passed, ${fail} failed`)
