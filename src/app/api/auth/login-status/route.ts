import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getIp } from "@/lib/apiUtils"

// Read-only status check — never modifies data, just tells the client WHY login failed.
// Called client-side after a CredentialsSignin error to show the right message.
export async function GET(req: Request) {
  const ip        = getIp(req)
  const email     = new URL(req.url).searchParams.get("email") ?? ""
  const windowStart = new Date(Date.now() - 900 * 1000).toISOString() // 15 min window

  // 1. Check IP rate limit
  const { count: ipCount } = await db
    .from("rate_limits")
    .select("*", { count: "exact", head: true })
    .eq("key", `login:${ip}`)
    .gte("window_start", windowStart)

  if ((ipCount ?? 0) >= 5) {
    return NextResponse.json({
      status : "rate_limited",
      message: "Too many failed attempts. Please wait 15 minutes before trying again.",
    })
  }

  // 2. Check account lockout
  if (email) {
    const { data: user } = await db
      .from("admin_users")
      .select("locked_until")
      .eq("email", email.trim().toLowerCase())
      .single()

    if (user?.locked_until && new Date(user.locked_until) > new Date()) {
      const minutesLeft = Math.ceil(
        (new Date(user.locked_until).getTime() - Date.now()) / 60_000
      )
      return NextResponse.json({
        status : "locked",
        message: `Account locked after too many failed attempts. Try again in ${minutesLeft} minute${minutesLeft === 1 ? "" : "s"}.`,
      })
    }
  }

  // 3. Just a wrong password
  return NextResponse.json({ status: "wrong_password" })
}
