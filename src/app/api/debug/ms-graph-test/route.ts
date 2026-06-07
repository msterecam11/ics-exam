import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"

// Temporary debug endpoint — REMOVE after fixing the Mail.Send issue
export async function GET() {
  const session = await auth()
  if (!session || session.user.role !== "admin")
    return NextResponse.json({ error: "Admin only" }, { status: 403 })

  const TENANT_ID     = process.env.MICROSOFT_TENANT_ID!
  const CLIENT_ID     = process.env.MICROSOFT_CLIENT_ID!
  const CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET!
  const USER_EMAIL    = process.env.MICROSOFT_USER_EMAIL!

  // Step 1: get token
  let token: string
  try {
    const tokenRes = await fetch(
      `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type:    "client_credentials",
          client_id:     CLIENT_ID,
          client_secret: CLIENT_SECRET,
          scope:         "https://graph.microsoft.com/.default",
        }),
      }
    )
    const tokenData = await tokenRes.json()
    if (!tokenRes.ok || !tokenData.access_token)
      return NextResponse.json({ step: "token", error: tokenData })
    token = tokenData.access_token

    // Decode JWT payload (middle part) to see roles
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString())
    const roles: string[] = payload.roles ?? []

    // Step 2: try to send a test email to ourselves
    const mailRes = await fetch(
      `https://graph.microsoft.com/v1.0/users/${USER_EMAIL}/sendMail`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            subject: "ICS App — Mail.Send Test",
            body: { contentType: "Text", content: "This is a Mail.Send permission test from the ICS app." },
            toRecipients: [{ emailAddress: { address: USER_EMAIL } }],
          },
          saveToSentItems: false,
        }),
      }
    )

    const mailResult = mailRes.status === 202
      ? { ok: true }
      : await mailRes.json().catch(() => ({ status: mailRes.status }))

    return NextResponse.json({
      tokenOk:       true,
      appId:         payload.appid,
      tenant:        payload.tid,
      roles,                          // should contain "Mail.Send" if permission is granted
      haMailSend:    roles.includes("Mail.Send"),
      sendMailStatus: mailRes.status,
      sendMailResult: mailResult,
    })

  } catch (err: any) {
    return NextResponse.json({ step: "exception", error: err?.message })
  }
}
