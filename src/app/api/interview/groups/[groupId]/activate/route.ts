import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

type Params = { params: Promise<{ groupId: string }> }

export async function POST(_: Request, { params }: Params) {
  const session = await auth()
  if (!session || !["admin", "instructor"].includes(session.user.role ?? ""))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { groupId } = await params

  // Load full group + config for snapshot
  const { data: group } = await db
    .from("assessment_groups")
    .select(`
      id, status, config_id,
      assessment_configs (
        id, name, assessor_weights, verdict_thresholds,
        pillars (
          id, name, weight, order_index, applicable_track_ids,
          competencies ( id, name, weight, order_index )
        )
      )
    `)
    .eq("id", groupId)
    .single()

  if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (group.status !== "draft")
    return NextResponse.json({ error: "Only draft groups can be activated" }, { status: 409 })

  const config = group.assessment_configs as any
  if (!config) return NextResponse.json({ error: "No config attached" }, { status: 400 })

  // Build config snapshot
  const snapshot = {
    id:                 config.id,
    name:               config.name,
    assessor_weights:   config.assessor_weights,
    verdict_thresholds: config.verdict_thresholds,
    pillars:            (config.pillars ?? [])
      .sort((a: any, b: any) => a.order_index - b.order_index)
      .map((p: any) => ({
        ...p,
        competencies: (p.competencies ?? [])
          .sort((a: any, b: any) => a.order_index - b.order_index),
      })),
  }

  const { data, error } = await db
    .from("assessment_groups")
    .update({ status: "active", config_snapshot: snapshot })
    .eq("id", groupId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
