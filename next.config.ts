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
  ? "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' https://challenges.cloudflare.com"
  : "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://challenges.cloudflare.com"

const storageSrc = supabaseHost ? `https://${supabaseHost}` : ""

const csp = [
  "default-src 'self'",
  scriptSrc,
  "style-src 'self' 'unsafe-inline'",
  // Images: allow Supabase storage, qrserver
  ["img-src 'self' data: blob:", "https://api.qrserver.com", storageSrc].filter(Boolean).join(" "),
  "font-src 'self'",
  `connect-src ${connectSrc} https://api.qrserver.com https://www.youtube.com`,
  // Frames: Supabase storage (PDFs), YouTube, Vimeo, Office Online, Google Docs
  [
    "frame-src 'self'",
    "https://challenges.cloudflare.com",
    storageSrc,
    "https://www.youtube.com",
    "https://player.vimeo.com",
    "https://view.officeapps.live.com",
    "https://docs.google.com",
  ].filter(Boolean).join(" "),
  // Media: Supabase storage for <video>/<audio>
  ["media-src 'self' blob:", storageSrc].filter(Boolean).join(" "),
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
].join("; ")

const nextConfig: NextConfig = {
  // Keep Puppeteer out of the webpack bundle — it uses native binaries
  // Keep these out of the Turbopack bundle — they use Node.js fs/path at init time
  serverExternalPackages: ["puppeteer", "pdf-parse", "pdfjs-dist"],

  images: {
    remotePatterns: [
      ...(supabaseHost
        ? [{ protocol: "https" as const, hostname: supabaseHost }]
        : []),
    ],
  },

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
