import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"

export default auth((req) => {
  const { pathname } = req.nextUrl

  // Protect authenticated routes at the middleware layer (first line of defence)
  // Layout components also redirect — this is defence-in-depth
  const protectedPaths = [
    "/dashboard", "/groups", "/courses", "/exams", "/reports", "/candidates",
    "/interview", "/hub", "/profile",
  ]
  const isProtectedPath = protectedPaths.some((p) => pathname.startsWith(p))

  if (isProtectedPath && !req.auth) {
    return NextResponse.redirect(new URL("/auth/login", req.url))
  }

  return NextResponse.next()
})

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|logo|icon|fonts|exam).*)",
  ],
}
