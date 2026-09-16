import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import bcrypt from "bcryptjs"
import { sendStudentCredentialsEmail } from "@/lib/email"

function isMgr(role?: string) {
  return role === "admin" || role === "instructor"
}

// Escapes PostgREST `.or()` filter metacharacters so a search string can't
// break out of the intended ilike clause.
// Makes a free-text search term safe to place inside a PostgREST .or() filter.
//
// This used to backslash-escape % _ , ( ) — but PostgREST does not treat a
// backslash as escaping a comma in an unquoted value. Verified: searching
// "x,email.ilike.*@*" still split into a second condition and returned EVERY
// user. Injected conditions could only reach column names without an
// underscore (the escaped "_" broke e.g. password_hash, by accident), and those
// columns are already shown to the managers who can search, so nothing hidden
// leaked — but the protection was not working. PostgREST's reserved characters
// in a logic tree are , . : ( ) " \ and * is its wildcard; a person's name or
// email never needs them for a substring search, so they are replaced with
// spaces instead of escaped. "." stays so email fragments like "gmail.com" still
// match — without a "," or "(" it cannot start a new condition.
function escapeFilterValue(v: string) {
  return v.replace(/[,:()"\\*%]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100)
}

// GET — list all students (with optional search + pagination)
export async function GET(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const search = searchParams.get("q") ?? ""
  const page   = parseInt(searchParams.get("page") ?? "1")
  const limit  = parseInt(searchParams.get("limit") ?? "50")
  const offset = (page - 1) * limit

  let query = db
    .from("lms_students")
    .select("id, name, email, job_title, company, language, last_login, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1)

  if (search) {
    const s = escapeFilterValue(search)
    query = query.or(`name.ilike.%${s}%,email.ilike.%${s}%,company.ilike.%${s}%`)
  }

  const { data, count, error } = await query
  // Generic message: the raw PostgREST error echoes the internal filter string.
  if (error) {
    console.error("[students] list query failed", error)
    return NextResponse.json({ error: "Could not load students" }, { status: 500 })
  }

  return NextResponse.json({ students: data ?? [], total: count ?? 0, page, limit })
}

// POST — create a student
export async function POST(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { name, email, password, job_title, company, department, language, sendEmail } = body

  if (!name?.trim())  return NextResponse.json({ error: "Name required" },  { status: 400 })
  if (!email?.trim()) return NextResponse.json({ error: "Email required" }, { status: 400 })
  if (!password || password.length < 8)
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 })

  const password_hash = await bcrypt.hash(password, 12)

  const { data, error } = await db
    .from("lms_students")
    .insert({
      name:       name.trim(),
      email:      email.trim().toLowerCase(),
      password_hash,
      job_title:  job_title?.trim()  || null,
      company:    company?.trim()    || null,
      department: department?.trim() || null,
      language:   language ?? "en",
    })
    .select("id, name, email, job_title, company, language, created_at")
    .single()

  if (error) {
    if (error.code === "23505")
      return NextResponse.json({ error: "Email already registered" }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let emailSent = false
  let emailError: string | null = null
  if (sendEmail) {
    try {
      await sendStudentCredentialsEmail({
        studentName:  name.trim(),
        studentEmail: email.trim().toLowerCase(),
        password,
      })
      emailSent = true
    } catch (err: any) {
      emailError = err?.message ?? "Unknown email error"
      console.error("[LMS student email] failed:", emailError)
    }
  }

  return NextResponse.json({ ...data, emailSent, emailError }, { status: 201 })
}

// PATCH — update student
export async function PATCH(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { id, name, email, password, job_title, company, department, language } = body
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  const updates: Record<string, unknown> = {}
  if (name?.trim())       updates.name       = name.trim()
  if (email?.trim())      updates.email      = email.trim().toLowerCase()
  if (job_title !== undefined) updates.job_title  = job_title?.trim() || null
  if (company   !== undefined) updates.company    = company?.trim()   || null
  if (department !== undefined) updates.department = department?.trim() || null
  if (language)           updates.language   = language
  if (password) {
    if (password.length < 8)
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 })
    updates.password_hash   = await bcrypt.hash(password, 12)
    updates.failed_attempts = 0
    updates.locked_until    = null
  }

  if (!Object.keys(updates).length)
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 })

  const { data, error } = await db
    .from("lms_students")
    .update(updates)
    .eq("id", id)
    .select("id, name, email, job_title, company, language, created_at")
    .single()

  if (error) {
    if (error.code === "23505")
      return NextResponse.json({ error: "Email already in use" }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

// DELETE — remove student
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session || session.user.role !== "admin")
    return NextResponse.json({ error: "Admin only" }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  const { error } = await db.from("lms_students").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
