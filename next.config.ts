import type { NextConfig } from "next"

const isDev = process.env.NODE_ENV === "development"

// Extract Supabase hostname for CSP connect-src
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
const supabaseHost = (() => {
  try { return supabaseUrl ? new URL(supabaseUrl).hostname : "" } catch { return "" }
})()

const connectSrc = ["'self'", supabaseHost && `https://${supabaseHost}`, supabaseHost && `wss://${supabaseHost}`]
  .filter(Boolean)
  .join(" ")

// In development, React (Turbopack) requires 'unsafe-eval' for hot reload & debugging.
// In production it is never needed and is intentionally omitted.
const scriptSrc = isDev
  ? "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com"
  : "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com"

const csp = [
  "default-src 'self'",
  scriptSrc,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://api.qrserver.com",
  "font-src 'self'",
  `connect-src ${connectSrc} https://api.qrserver.com`,
  "frame-src https://challenges.cloudflare.com",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
].join("; ")

const nextConfig: NextConfig = {
  // Keep Puppeteer out of the webpack bundle — it uses native binaries
  serverExternalPackages: ["puppeteer"],

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options",           value: "DENY" },
          { key: "X-Content-Type-Options",     value: "nosniff" },
          { key: "Referrer-Policy",            value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy",         value: "camera=(), microphone=(), geolocation=(), payment=()" },
          { key: "Strict-Transport-Security",  value: "max-age=63072000; includeSubDomains; preload" },
          { key: "Content-Security-Policy",    value: csp },
        ],
      },
    ]
  },
}

export default nextConfig
