import { notFound, redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import QRCardPrint from "@/components/interview/schedule/QRCardPrint"

export default async function ScheduleQRCardPage({
  params,
  searchParams,
}: {
  params:       Promise<{ scheduleId: string }>
  searchParams: Promise<{ theme?: string }>
}) {
  const session = await auth()
  if (!session) redirect("/auth/login")

  const { scheduleId } = await params
  const { theme }      = await searchParams

  const { data: schedule, error } = await db
    .from("schedules")
    .select(`
      id, name, description, location, timezone,
      slot_duration_min, buffer_min, interview_format,
      booking_mode, status,
      assessment_groups ( name ),
      role_tracks       ( name )
    `)
    .eq("id", scheduleId)
    .single()

  if (error || !schedule) notFound()

  // Get earliest slot date
  const { data: firstSlot } = await db
    .from("schedule_slots")
    .select("start_utc, end_utc")
    .eq("schedule_id", scheduleId)
    .order("start_utc", { ascending: true })
    .limit(1)
    .single()

  const { data: lastSlot } = await db
    .from("schedule_slots")
    .select("end_utc")
    .eq("schedule_id", scheduleId)
    .order("end_utc", { ascending: false })
    .limit(1)
    .single()

  const appUrl    = process.env.NEXT_PUBLIC_APP_URL ?? "https://ics.aviation"
  const bookingUrl = `${appUrl}/book/${scheduleId}`
  const isDark     = theme !== "light"

  return (
    <QRCardPrint
      schedule={schedule}
      firstSlot={firstSlot ?? null}
      lastSlot={lastSlot ?? null}
      bookingUrl={bookingUrl}
      dark={isDark}
    />
  )
}
