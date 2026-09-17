// EM-16 — global email settings: the master switch, test mode, the daily cap,
// and the on/off + timing numbers every program inherits.
//
// GET    → { config, rules }
// PATCH  → { config?: {...}, rules?: { <code>: { enabled?, config? } } }

import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { loadEmailSettings } from "@/lib/lms-email-settings"
import { RULE_BY_CODE, defaultConfig, validateKnobs } from "@/lib/lms-email-rules"

export const dynamic = "force-dynamic"

async function admin() {
  const session = await auth()
  if (!session || session.user.role !== "admin") return null
  return session
}

export async function GET() {
  if (!(await admin())) return NextResponse.json({ error: "Admin only" }, { status: 403 })
  return NextResponse.json(await loadEmailSettings())
}

export async function PATCH(req: Request) {
  const session = await admin()
  if (!session) return NextResponse.json({ error: "Admin only" }, { status: 403 })

  const body = await req.json().catch(() => ({})) as any
  const now = new Date().toISOString()
  const by = session.user.id

  // ── Global configuration ──
  if (body.config && typeof body.config === "object") {
    const c = body.config
    const patch: Record<string, any> = { updated_at: now, updated_by: by }
    if (typeof c.master_enabled === "boolean") patch.master_enabled = c.master_enabled
    if (typeof c.test_mode === "boolean") patch.test_mode = c.test_mode
    if ("test_address" in c) {
      const a = typeof c.test_address === "string" ? c.test_address.trim() : ""
      if (a && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(a))
        return NextResponse.json({ error: "That test address doesn't look like an e-mail" }, { status: 400 })
      patch.test_address = a || null
    }
    if (c.daily_cap !== undefined) {
      const n = Number(c.daily_cap)
      if (!Number.isInteger(n) || n < 0 || n > 20)
        return NextResponse.json({ error: "Daily limit must be between 0 and 20" }, { status: 400 })
      patch.daily_cap = n
    }
    // Turning test mode on without an address would silently stop every email.
    const next = { ...(await loadEmailSettings()).config, ...patch }
    if (next.test_mode && !next.test_address)
      return NextResponse.json({ error: "Set a test address before turning test mode on" }, { status: 400 })

    const { error } = await db.from("lms_email_config").update(patch).eq("id", 1)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // ── Per-email defaults ──
  // Each rule is merged onto what is already stored, so sending only a switch
  // never wipes that rule's timing numbers (and the other way round).
  if (body.rules && typeof body.rules === "object") {
    const current = (await loadEmailSettings()).rules
    for (const [code, value] of Object.entries(body.rules as Record<string, any>)) {
      const def = RULE_BY_CODE[code]
      if (!def) return NextResponse.json({ error: `Unknown email "${code}"` }, { status: 400 })
      const existing = current[code] ?? { enabled: true, config: defaultConfig(code) }

      let config = existing.config
      if (value?.config && typeof value.config === "object") {
        const clean = validateKnobs(def.knobs ?? [], value.config)
        if ("error" in clean) return NextResponse.json({ error: clean.error }, { status: 400 })
        config = { ...existing.config, ...clean.value }
      }
      const enabled = typeof value?.enabled === "boolean" ? value.enabled : existing.enabled

      const { error } = await db.from("lms_email_rules")
        .upsert({ code, enabled, config, updated_at: now, updated_by: by }, { onConflict: "code" })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  return NextResponse.json(await loadEmailSettings())
}
