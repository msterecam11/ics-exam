import { notFound, redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import QRCardPrint from "@/components/interview/schedule/QRCardPrint"

export default async function ScheduleQRCardPage({
  params,
  searchParams,
}: {
  params:       Promise<{ scheduleId: string }>
  searchParams: Promise<{ pdf_secret?: string }>
}) {
  // Allow Puppeteer access via pdf_secret
  const { pdf_secret } = await searchParams
  const validSecret = pdf_secret && pdf_secret === encodeURIComponent(process.env.NEXTAUTH_SECRET ?? "")

  if (!validSecret) {
    const session = await auth()
    if (!session) redirect("/auth/login")
  }

  const { scheduleId } = await params

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

  const appUrl     = process.env.NEXT_PUBLIC_APP_URL ?? "https://ics.aviation"
  const bookingUrl = `${appUrl}/book/${scheduleId}`

  return (
    <>
      <style>{`
        @font-face { font-family:'PlusJakartaSans'; src:url('/fonts/PlusJakartaSans-Light.ttf') format('truetype'); font-weight:300; }
        @font-face { font-family:'PlusJakartaSans'; src:url('/fonts/PlusJakartaSans-Regular.ttf') format('truetype'); font-weight:400; }
        @font-face { font-family:'PlusJakartaSans'; src:url('/fonts/PlusJakartaSans-Bold.ttf') format('truetype'); font-weight:700; }
        *, *::before, *::after { box-sizing: border-box; }
        html, body { margin: 0; padding: 24px; background: #f0f4f8; font-family: 'PlusJakartaSans','Segoe UI',Arial,sans-serif; }
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      `}</style>
      <QRCardPrint
        schedule={schedule}
        firstSlot={firstSlot ?? null}
        lastSlot={lastSlot ?? null}
        bookingUrl={bookingUrl}
      />
    </>
  )
}
