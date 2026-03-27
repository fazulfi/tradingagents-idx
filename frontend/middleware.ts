import NextAuth from "next-auth"
import { authConfig } from "./auth.config"
import { NextResponse } from "next/server"

const { auth } = NextAuth(authConfig)

export default auth((req) => {
  const { pathname } = req.nextUrl
  // Allow public paths
  if (pathname === "/login" || pathname.startsWith("/api/auth")) {
    return
  }
  // Allow CLI clients with valid x-api-key on any /api/* route
  if (pathname.startsWith("/api/")) {
    const apiKey = req.headers.get("x-api-key")
    if (apiKey && apiKey === process.env.DASHBOARD_SECRET) {
      const adminUserId = process.env.ADMIN_USER_ID
      if (adminUserId) {
        const response = NextResponse.next()
        response.headers.set("x-cli-user-id", adminUserId)
        return response
      }
      // ADMIN_USER_ID not configured — pass through, authHelpers will do Prisma fallback
      return NextResponse.next()
    }
  }
  // Redirect unauthenticated users to /login
  if (!req.auth) {
    return Response.redirect(new URL("/login", req.url))
  }
})

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
