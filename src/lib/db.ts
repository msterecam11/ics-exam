import { createClient } from "@supabase/supabase-js"

// Fallback placeholder prevents build-time crash when env vars aren't injected
// (e.g. Docker build without build args). Real values are always present at runtime.
export const db = createClient(
  process.env.SUPABASE_URL ?? "https://placeholder.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "placeholder",
  { auth: { persistSession: false } }
)

// Public client for candidate-facing pages (respects RLS)
export const supabasePublic = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder"
)
