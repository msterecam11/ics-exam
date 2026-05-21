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
  subject:       string
  startUtc:      string   // ISO 8601 UTC
  endUtc:        string   // ISO 8601 UTC
  location?:     string
  body?:         string
  attendeeEmail?: string
  attendeeName?:  string
  isOnline?:     boolean
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

  if (input.attendeeEmail) {
    body.attendees = [{
      emailAddress: { address: input.attendeeEmail, name: input.attendeeName ?? input.attendeeEmail },
      type: "required",
    }]
  }

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
