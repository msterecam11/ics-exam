import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"

const DEFAULT_LIMIT = 50
const MAX_LIMIT     = 200

export async function GET(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const page  = Math.max(1, parseInt(searchParams.get("page")  ?? "1",  10) || 1)
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT))
  const from  = (page - 1) * limit
  const to    = from + limit - 1

  const { data, error, count } = await db
    .from("candidates")
    .select("*, exams(title)", { count: "exact" })
    .order("started_at", { ascending: false })
    .range(from, to)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    data:       data ?? [],
    pagination: {
      page,
      limit,
      total:      count ?? 0,
      totalPages: Math.ceil((count ?? 0) / limit),
    },
  })
}
