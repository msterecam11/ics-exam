// ─── Microsoft Graph API Helper ──────────────────────────────────────────────
// Handles token acquisition and calendar / online-meeting operations.
// All functions are server-side only (uses CLIENT_SECRET).

const TENANT_ID     = process.env.MICROSOFT_TENANT_ID!
const CLIENT_ID     = process.env.MICROSOFT_CLIENT_ID!
const CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET!
const USER_EMAIL    = process.env.MICROSOFT_USER_EMAIL!
const GRAPH_BASE    = "https://graph.microsoft.com/v1.0"

// ─── Token cache (in-memory, reused until expiry) ─────────────────────────────
let _token: string | null = null
let _tokenExpiry = 0

async function getAccessToken(): Promise<string> {
  if (_token && Date.now() < _tokenExpiry - 60_000) return _token

  const res = await fetch(
    `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
    {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body:    new URLSearchParams({
        grant_type:    "client_credentials",
        client_id:     CLIENT_ID,
        client_secret: CLIENT_SECRET,
        scope:         "https://graph.microsoft.com/.default",
      }),
    }
  )

  const data = await res.json()
  if (!res.ok || !data.access_token) {
    throw new Error(`MS Graph token error: ${data.error_description ?? data.error}`)
  }

  _token       = data.access_token
  _tokenExpiry = Date.now() + data.expires_in * 1000
  return _token!
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CalendarEventInput {
  subject:            string
  startUtc:           string   // ISO 8601 UTC
  endUtc:             string   // ISO 8601 UTC
  location?:          string
  body?:              string
  attendeeEmail?:     string
  attendeeName?:      string
  isOnline?:          boolean
  internalAttendees?: string[] // optional internal cc — added as optional attendees
}

export interface CalendarEventResult {
  eventId:      string
  teamsUrl:     string | null
  webLink:      string
}

// ─── Create Calendar Event ────────────────────────────────────────────────────

export async function createCalendarEvent(
  input: CalendarEventInput
): Promise<CalendarEventResult> {
  const token = await getAccessToken()

  const body: any = {
    subject: input.subject,
    start:   { dateTime: input.startUtc, timeZone: "UTC" },
    end:     { dateTime: input.endUtc,   timeZone: "UTC" },
    body: {
      contentType: "HTML",
      content:     input.body ?? "",
    },
  }

  if (input.location) {
    body.location = { displayName: input.location }
  }

  const attendees: any[] = []

  if (input.attendeeEmail) {
    attendees.push({
      emailAddress: { address: input.attendeeEmail, name: input.attendeeName ?? input.attendeeEmail },
      type: "required",
    })
  }

  for (const email of input.internalAttendees ?? []) {
    if (email) attendees.push({
      emailAddress: { address: email, name: email },
      type: "optional",
    })
  }

  if (attendees.length > 0) body.attendees = attendees

  if (input.isOnline) {
    body.isOnlineMeeting      = true
    body.onlineMeetingProvider = "teamsForBusiness"
  }

  const res = await fetch(`${GRAPH_BASE}/users/${USER_EMAIL}/events`, {
    method:  "POST",
    headers: {
      Authorization:  `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })

  const data = await res.json()
  if (!res.ok) {
    throw new Error(`MS Graph createEvent error: ${data.error?.message ?? JSON.stringify(data)}`)
  }

  return {
    eventId:  data.id,
    teamsUrl: data.onlineMeeting?.joinUrl ?? null,
    webLink:  data.webLink,
  }
}

// ─── Update Calendar Event ────────────────────────────────────────────────────

export async function updateCalendarEvent(
  eventId: string,
  patch:   Partial<CalendarEventInput>
): Promise<void> {
  const token = await getAccessToken()

  const body: any = {}
  if (patch.subject)   body.subject = patch.subject
  if (patch.startUtc)  body.start   = { dateTime: patch.startUtc, timeZone: "UTC" }
  if (patch.endUtc)    body.end     = { dateTime: patch.endUtc,   timeZone: "UTC" }
  if (patch.location)  body.location = { displayName: patch.location }
  if (patch.body)      body.body    = { contentType: "HTML", content: patch.body }

  const res = await fetch(`${GRAPH_BASE}/users/${USER_EMAIL}/events/${eventId}`, {
    method:  "PATCH",
    headers: {
      Authorization:  `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const data = await res.json()
    throw new Error(`MS Graph updateEvent error: ${data.error?.message ?? JSON.stringify(data)}`)
  }
}

// ─── Delete Calendar Event ────────────────────────────────────────────────────

export async function deleteCalendarEvent(eventId: string): Promise<void> {
  const token = await getAccessToken()

  const res = await fetch(`${GRAPH_BASE}/users/${USER_EMAIL}/events/${eventId}`, {
    method:  "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!res.ok && res.status !== 404) {
    const data = await res.json()
    throw new Error(`MS Graph deleteEvent error: ${data.error?.message ?? JSON.stringify(data)}`)
  }
}

// ─── Get Attendee RSVP Status ────────────────────────────────────────────────
// Fetches the calendar event and returns the candidate's response status,
// mapped from MS Graph values to our rsvp_status enum.
//
// MS Graph attendee response values:
//   none / notResponded → "pending"
//   tentativelyAccepted → "tentative"
//   accepted            → "accepted"
//   declined            → "declined"

export type RsvpStatus = "pending" | "accepted" | "tentative" | "declined"

export async function getAttendeeStatus(
  eventId:        string,
  attendeeEmail:  string
): Promise<RsvpStatus> {
  const token = await getAccessToken()

  const res = await fetch(
    `${GRAPH_BASE}/users/${USER_EMAIL}/events/${eventId}?$select=attendees`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  )

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`MS Graph getEvent error: ${err.error?.message ?? res.status}`)
  }

  const data = await res.json()
  const attendees: any[] = data.attendees ?? []

  // Find the matching attendee (case-insensitive email match)
  const match = attendees.find(
    (a: any) => a.emailAddress?.address?.toLowerCase() === attendeeEmail.toLowerCase()
  )

  const graphResponse: string = match?.status?.response ?? "none"

  const map: Record<string, RsvpStatus> = {
    none:               "pending",
    notResponded:       "pending",
    tentativelyAccepted:"tentative",
    accepted:           "accepted",
    declined:           "declined",
  }

  return map[graphResponse] ?? "pending"
}

// ─── Send Candidate Confirmation Email ───────────────────────────────────────

export interface ConfirmationEmailInput {
  candidateName:  string
  candidateEmail: string
  scheduleName:   string
  startUtc:       string
  endUtc:         string
  timezone:       string
  confirmCode:    string
  location?:      string
  teamsUrl?:      string | null
  trackName?:     string
  manageUrl?:     string
  isReschedule?:  boolean
}

function fmtDateTime(utc: string, tz: string, opts: Intl.DateTimeFormatOptions): string {
  return new Date(utc).toLocaleString("en-GB", { timeZone: tz, ...opts })
}

export async function sendConfirmationEmail(input: ConfirmationEmailInput): Promise<void> {
  const token = await getAccessToken()

  const tz      = input.timezone ?? "Asia/Dubai"
  const tzShort = tz.split("/").pop()?.replace(/_/g, " ") ?? tz

  const date  = fmtDateTime(input.startUtc, tz, { day: "numeric", month: "long", year: "numeric" })
  const start = fmtDateTime(input.startUtc, tz, { hour: "2-digit", minute: "2-digit", hour12: false })
  const end   = fmtDateTime(input.endUtc,   tz, { hour: "2-digit", minute: "2-digit", hour12: false })

  const isReschedule = input.isReschedule ?? false

  const locationRow = input.location
    ? `<tr>
        <td style="padding:10px 16px;color:#64748b;font-size:13px;white-space:nowrap;border-bottom:1px solid #f1f5f9;">📍 Location</td>
        <td style="padding:10px 16px;font-weight:600;font-size:13px;border-bottom:1px solid #f1f5f9;">${input.location}</td>
       </tr>`
    : ""

  const teamsRow = input.teamsUrl
    ? `<tr>
        <td style="padding:10px 16px;color:#64748b;font-size:13px;white-space:nowrap;border-bottom:1px solid #f1f5f9;">🔗 Teams Link</td>
        <td style="padding:10px 16px;font-size:13px;border-bottom:1px solid #f1f5f9;">
          <a href="${input.teamsUrl}" style="color:#1B4F8A;font-weight:600;">Join Interview</a>
        </td>
       </tr>`
    : ""

  const trackRow = input.trackName
    ? `<tr>
        <td style="padding:10px 16px;color:#64748b;font-size:13px;white-space:nowrap;border-bottom:1px solid #f1f5f9;">🎯 Role / Track</td>
        <td style="padding:10px 16px;font-weight:600;font-size:13px;border-bottom:1px solid #f1f5f9;">${input.trackName}</td>
       </tr>`
    : ""

  const manageRow = input.manageUrl
    ? `<div style="text-align:center;margin-bottom:20px;">
        <a href="${input.manageUrl}"
          style="display:inline-block;background:#f1f5fb;border:1px solid #dbeafe;color:#1B4F8A;font-size:12px;font-weight:600;padding:10px 22px;border-radius:999px;text-decoration:none;">
          ✏️ Reschedule or Cancel my booking
        </a>
       </div>`
    : ""

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

    <!-- Header -->
    <div style="background:#1B4F8A;padding:28px 32px;text-align:center;">
      <p style="color:rgba(255,255,255,0.7);font-size:11px;text-transform:uppercase;letter-spacing:3px;margin:0 0 6px;">ICS Aviation</p>
      <h1 style="color:white;font-size:22px;font-weight:700;margin:0;">${isReschedule ? "Booking Rescheduled" : "Interview Booking Confirmed"}</h1>
    </div>

    <!-- Body -->
    <div style="padding:28px 32px;">
      <p style="color:#334155;font-size:15px;margin:0 0 20px;">
        Hi <strong>${input.candidateName}</strong>,<br><br>
        ${isReschedule
          ? "Your interview booking has been successfully rescheduled. Here are your updated details."
          : "Your interview slot has been successfully booked. Please find the details below."}
      </p>

      <!-- Details table -->
      <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;margin-bottom:24px;">
        <tr>
          <td style="padding:10px 16px;color:#64748b;font-size:13px;white-space:nowrap;border-bottom:1px solid #f1f5f9;">📅 Date</td>
          <td style="padding:10px 16px;font-weight:600;font-size:13px;border-bottom:1px solid #f1f5f9;">${date}</td>
        </tr>
        <tr>
          <td style="padding:10px 16px;color:#64748b;font-size:13px;white-space:nowrap;border-bottom:1px solid #f1f5f9;">🕐 Time</td>
          <td style="padding:10px 16px;font-weight:600;font-size:13px;border-bottom:1px solid #f1f5f9;">${start} – ${end} (${tzShort})</td>
        </tr>
        <tr>
          <td style="padding:10px 16px;color:#64748b;font-size:13px;white-space:nowrap;border-bottom:1px solid #f1f5f9;">📋 Schedule</td>
          <td style="padding:10px 16px;font-weight:600;font-size:13px;border-bottom:1px solid #f1f5f9;">${input.scheduleName}</td>
        </tr>
        ${trackRow}
        ${locationRow}
        ${teamsRow}
      </table>

      <!-- Confirmation code -->
      <div style="background:#f1f5fb;border:1px solid #dbeafe;border-radius:12px;padding:16px 20px;text-align:center;margin-bottom:24px;">
        <p style="color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:2px;margin:0 0 6px;">Your Confirmation Code</p>
        <p style="color:#1B4F8A;font-size:24px;font-weight:800;font-family:monospace;letter-spacing:4px;margin:0;">${input.confirmCode}</p>
        <p style="color:#94a3b8;font-size:11px;margin:6px 0 0;">Keep this code — you may need it to manage your booking</p>
      </div>

      <p style="color:#64748b;font-size:13px;line-height:1.7;margin:0 0 20px;">
        A calendar invite has been sent to your email. Please arrive on time.
      </p>

      ${manageRow}
    </div>

    <!-- Footer -->
    <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 32px;text-align:center;">
      <p style="color:#94a3b8;font-size:11px;margin:0;">ICS Aviation — Integrated Consulting Services</p>
      <p style="color:#94a3b8;font-size:11px;margin:4px 0 0;">Good luck with your interview! 🎯</p>
    </div>
  </div>
</body>
</html>`.trim()

  const res = await fetch(`${GRAPH_BASE}/users/${USER_EMAIL}/sendMail`, {
    method:  "POST",
    headers: {
      Authorization:  `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        subject: `${isReschedule ? "Booking Rescheduled" : "Interview Booking Confirmed"} — ${input.scheduleName}`,
        body:    { contentType: "HTML", content: html },
        toRecipients: [{
          emailAddress: { address: input.candidateEmail, name: input.candidateName },
        }],
      },
      saveToSentItems: true,
    }),
  })

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(`MS Graph sendMail error: ${data.error?.message ?? res.status}`)
  }
}

// ─── Build booking event body ─────────────────────────────────────────────────

export function buildBookingEventBody(opts: {
  candidateName:  string
  candidateEmail: string
  scheduleName:   string
  location?:      string
  trackName?:     string
  confirmCode:    string
}): string {
  return `
    <h3>ICS Aviation — Interview Booking</h3>
    <table style="border-collapse:collapse;font-family:sans-serif;font-size:14px;">
      <tr><td style="padding:4px 12px 4px 0;color:#64748b;">Candidate</td>
          <td style="padding:4px 0;font-weight:600;">${opts.candidateName}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#64748b;">Email</td>
          <td style="padding:4px 0;">${opts.candidateEmail}</td></tr>
      ${opts.trackName ? `
      <tr><td style="padding:4px 12px 4px 0;color:#64748b;">Role / Track</td>
          <td style="padding:4px 0;">${opts.trackName}</td></tr>` : ""}
      <tr><td style="padding:4px 12px 4px 0;color:#64748b;">Schedule</td>
          <td style="padding:4px 0;">${opts.scheduleName}</td></tr>
      ${opts.location ? `
      <tr><td style="padding:4px 12px 4px 0;color:#64748b;">Location</td>
          <td style="padding:4px 0;">${opts.location}</td></tr>` : ""}
      <tr><td style="padding:4px 12px 4px 0;color:#64748b;">Confirmation</td>
          <td style="padding:4px 0;font-family:monospace;font-weight:700;">${opts.confirmCode}</td></tr>
    </table>
  `.trim()
}
