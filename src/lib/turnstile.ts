// Cloudflare Turnstile server-side verification.
// Uses TURNSTILE_SECRET_KEY (shared with the admin/hub login).
export async function verifyTurnstile(token: string): Promise<boolean> {
  try {
    const res = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method:  "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body:    new URLSearchParams({
          secret:   process.env.TURNSTILE_SECRET_KEY ?? "",
          response: token,
        }),
      }
    )
    const data = await res.json()
    return data.success === true
  } catch {
    return false
  }
}
