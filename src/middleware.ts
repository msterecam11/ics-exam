import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"

export default auth((req) => {
  const { pathname } = req.nextUrl

  // Protect admin routes
  const adminPaths = ["/dashboard", "/groups", "/courses", "/exams", "/reports", "/candidates"]
  const isAdminPath = adminPaths.some((p) => pathname.startsWith(p))

  if (isAdminPath && !req.auth) {
    return NextResponse.redirect(new URL("/auth/login", req.url))
  }

  return NextResponse.next()
})

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|logo|icon|fonts|exam).*)",
  ],
}
