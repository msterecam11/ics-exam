import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { db } from "@/lib/db"
import { rateLimit } from "@/lib/rateLimit"
import bcrypt from "bcryptjs"
import { z } from "zod"

// ── Input schema ──────────────────────────────────────────────────────────────

const LoginSchema = z.object({
  email          : z.string().trim().email().max(255),
  password       : z.string().min(1).max(128),
  turnstileToken : z.string().optional(),
})

// ── Turnstile verification ────────────────────────────────────────────────────

async function verifyTurnstile(token: string): Promise<boolean> {
  try {
    const res = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method : "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body   : new URLSearchParams({
          secret  : process.env.TURNSTILE_SECRET_KEY ?? "",
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

// ── NextAuth config ───────────────────────────────────────────────────────────

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email         : { label: "Email",           type: "email" },
        password      : { label: "Password",        type: "password" },
        turnstileToken: { label: "Turnstile Token", type: "text" },
      },

      async authorize(credentials, request) {
        // ── 1. Validate input shape & lengths ────────────────────────────────
        const parsed = LoginSchema.safeParse(credentials)
        if (!parsed.success) return null
        const { email, password, turnstileToken } = parsed.data

        // ── 2. Cloudflare Turnstile CAPTCHA (production only) ────────────────
        if (process.env.NODE_ENV === "production") {
          if (!turnstileToken) return null
          const captchaOk = await verifyTurnstile(turnstileToken)
          if (!captchaOk) return null
        }

        // ── 3. IP-based rate limiting (5 attempts / 15 min) ──────────────────
        const ip =
          request?.headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          request?.headers?.get("x-real-ip") ??
          "unknown"
        const { allowed } = await rateLimit(`login:${ip}`, 5, 900)
        if (!allowed) return null

        // ── 4. Fetch user ─────────────────────────────────────────────────────
        const { data: user } = await db
          .from("admin_users")
          .select("id, email, name, role, password_hash, failed_attempts, locked_until")
          .eq("email", email)
          .single()

        // ── 5. Always run bcrypt — prevents timing attack (user enumeration) ──
        //    If user not found we compare against a dummy hash so the response
        //    time is identical whether the email exists or not.
        const hashToCompare = user?.password_hash ?? "$2b$12$abcdefghijklmnopqrstuvuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu"
        let passwordMatch = false
        try {
          passwordMatch = await bcrypt.compare(password, hashToCompare)
        } catch {
          passwordMatch = false
        }

        // No user found (after constant-time compare)
        if (!user) return null

        // ── 6. Account lockout check ──────────────────────────────────────────
        if (user.locked_until && new Date(user.locked_until) > new Date()) {
          return null
        }

        // ── 7. Wrong password ─────────────────────────────────────────────────
        if (!passwordMatch) {
          const newAttempts = (user.failed_attempts ?? 0) + 1
          const updates: Record<string, unknown> = { failed_attempts: newAttempts }
          if (newAttempts >= 5) {
            // Lock for 15 minutes
            updates.locked_until = new Date(Date.now() + 15 * 60 * 1000).toISOString()
          }
          await db.from("admin_users").update(updates).eq("id", user.id)
          return null
        }

        // ── 8. Success — reset lockout state ──────────────────────────────────
        await db
          .from("admin_users")
          .update({ failed_attempts: 0, locked_until: null })
          .eq("id", user.id)

        return { id: user.id, email: user.email, name: user.name, role: user.role }
      },
    }),
  ],

  callbacks: {
    jwt({ token, user, trigger, session: sessionUpdate }) {
      if (user) {
        token.role = (user as { role?: string }).role
        token.id   = user.id
      }
      if (trigger === "update" && sessionUpdate) {
        if (sessionUpdate.name)  token.name  = sessionUpdate.name
        if (sessionUpdate.email) token.email = sessionUpdate.email
      }
      return token
    },
    session({ session, token }) {
      if (token) {
        session.user.role = token.role as string
        session.user.id   = token.id  as string
      }
      return session
    },
  },

  pages: { signIn: "/auth/login" },
})
