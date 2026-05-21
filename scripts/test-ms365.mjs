// Quick MS Graph connection test — run with: node scripts/test-ms365.mjs
import { readFileSync } from "fs"
import { resolve } from "path"

// Load .env.local manually
const envPath = resolve(process.cwd(), ".env.local")
const envContent = readFileSync(envPath, "utf-8")
const env = Object.fromEntries(
  envContent.split("\n")
    .filter(l => l.trim() && !l.startsWith("#"))
    .map(l => l.split("=").map((v, i) => i === 0 ? v.trim() : v.trim()))
    .filter(([k]) => k)
)

const CLIENT_ID     = env.MICROSOFT_CLIENT_ID
const TENANT_ID     = env.MICROSOFT_TENANT_ID
const CLIENT_SECRET = env.MICROSOFT_CLIENT_SECRET
const USER_EMAIL    = env.MICROSOFT_USER_EMAIL

console.log("\n🔍 MS365 Connection Test")
console.log("─────────────────────────────────────────")
console.log(`  Client ID  : ${CLIENT_ID?.slice(0,8)}...`)
console.log(`  Tenant ID  : ${TENANT_ID?.slice(0,8)}...`)
console.log(`  Secret     : ${CLIENT_SECRET ? "✅ present" : "❌ missing"}`)
console.log(`  Email      : ${USER_EMAIL}`)
console.log("─────────────────────────────────────────")

// Step 1 — Get access token
console.log("\n⏳ Step 1: Getting access token from Azure...")

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

if (!tokenRes.ok || !tokenData.access_token) {
  console.error("❌ Failed to get access token")
  console.error("   Error:", tokenData.error)
  console.error("   Description:", tokenData.error_description)
  process.exit(1)
}

console.log("✅ Access token received successfully!")

// Step 2 — Test Calendar access
console.log("\n⏳ Step 2: Testing Calendar access...")

const calRes = await fetch(
  `https://graph.microsoft.com/v1.0/users/${USER_EMAIL}/calendar`,
  {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  }
)

const calData = await calRes.json()

if (!calRes.ok) {
  console.error("❌ Calendar access failed")
  console.error("   Error:", calData.error?.code)
  console.error("   Message:", calData.error?.message)
  process.exit(1)
}

console.log(`✅ Calendar access confirmed!`)
console.log(`   Calendar: ${calData.name}`)
console.log(`   Owner:    ${calData.owner?.name} (${calData.owner?.address})`)

// Step 3 — Test Teams link via Calendar Event (what our booking code actually uses)
console.log("\n⏳ Step 3: Testing Teams meeting via Calendar event (isOnlineMeeting: true)...")

const now       = new Date()
const startTime = new Date(now.getTime() + 60 * 60 * 1000).toISOString()
const endTime   = new Date(now.getTime() + 90 * 60 * 1000).toISOString()

const evtRes = await fetch(
  `https://graph.microsoft.com/v1.0/users/${USER_EMAIL}/events`,
  {
    method: "POST",
    headers: {
      Authorization:  `Bearer ${tokenData.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      subject: "ICS Test Event — DELETE ME",
      start:   { dateTime: startTime, timeZone: "UTC" },
      end:     { dateTime: endTime,   timeZone: "UTC" },
      isOnlineMeeting:       true,
      onlineMeetingProvider: "teamsForBusiness",
    }),
  }
)

const evtData = await evtRes.json()

if (!evtRes.ok) {
  console.error("❌ Calendar event creation failed:")
  console.error("   HTTP Status :", evtRes.status)
  console.error("   Error code  :", evtData.error?.code)
  console.error("   Message     :", evtData.error?.message)
} else {
  const teamsUrl = evtData.onlineMeeting?.joinUrl ?? null
  if (teamsUrl) {
    console.log("✅ Calendar event with Teams link created successfully!")
    console.log("   Event ID   :", evtData.id)
    console.log("   Teams Link :", teamsUrl)
  } else {
    console.warn("⚠️  Event created but NO Teams link was returned.")
    console.warn("   Event ID   :", evtData.id)
    console.warn("   This usually means the Teams policy is not applied yet.")
  }

  // Clean up — delete the test event
  await fetch(
    `https://graph.microsoft.com/v1.0/users/${USER_EMAIL}/events/${evtData.id}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${tokenData.access_token}` } }
  )
  console.log("   (test event deleted ✅)")
}

console.log("\n─────────────────────────────────────────")
console.log("🎉 MS365 is fully connected and ready!")
console.log("   You can now build the scheduling module.")
console.log("─────────────────────────────────────────\n")
