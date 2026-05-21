// ─── Slot Pool Utilities ──────────────────────────────────────────────────────
// When multiple schedules share the same interviewer team, they are linked via
// a slot_pool_id. Booking a slot in one schedule automatically blocks the same
// time window in all other schedules in the pool, and cancelling/rescheduling
// automatically unblocks them.

import { db } from "@/lib/db"

/**
 * After a booking is confirmed, block overlapping slots in all other
 * schedules that share the same slot pool.
 */
export async function blockPoolSlots(opts: {
  scheduleId: string
  slotPoolId: string
  startUtc:   string
  endUtc:     string
  bookingId:  string
}): Promise<void> {
  const { scheduleId, slotPoolId, startUtc, endUtc, bookingId } = opts

  // Get sibling schedules in the same pool
  const { data: siblings } = await db
    .from("schedules")
    .select("id")
    .eq("slot_pool_id", slotPoolId)
    .neq("id", scheduleId)

  if (!siblings || siblings.length === 0) return

  const siblingIds = siblings.map((s: any) => s.id)

  // Block any slot that overlaps with the booked window
  // Only touch slots that aren't already blocked (manual or pool)
  await db
    .from("schedule_slots")
    .update({ is_blocked: true, pool_blocked_by: bookingId })
    .in("schedule_id", siblingIds)
    .lt("start_utc", endUtc)   // slot starts before booking ends
    .gt("end_utc", startUtc)   // slot ends after booking starts
    .eq("is_blocked", false)
    .is("pool_blocked_by", null)
}

/**
 * After a booking is cancelled or rescheduled away from a slot,
 * unblock all slots that were blocked specifically by that booking.
 */
export async function unblockPoolSlots(bookingId: string): Promise<void> {
  await db
    .from("schedule_slots")
    .update({ is_blocked: false, pool_blocked_by: null })
    .eq("pool_blocked_by", bookingId)
}
