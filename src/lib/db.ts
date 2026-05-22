import { createClient } from "@supabase/supabase-js"

// Server-only client — uses service_role key, bypasses RLS.
// Never expose this client to the browser.
// All DB access goes through server-side API routes using this client.
export const db = createClient(
  process.env.SUPABASE_URL ?? "https://placeholder.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "placeholder",
  { auth: { persistSession: false } }
)
