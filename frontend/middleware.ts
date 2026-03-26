import NextAuth from "next-auth"
import { authConfig } from "./auth.config"

const { auth } = NextAuth(authConfig)

export default auth((req) => {
  const { pathname } = req.nextUrl
  // Allow public paths
  if (pathname === "/login" || pathname.startsWith("/api/auth")) {
    return
  }
  // /api/analyze is deprecated but allow CLI clients with valid x-api-key
  if (pathname === "/api/analyze") {
    const apiKey = req.headers.get("x-api-key")
    if (apiKey && apiKey === process.env.DASHBOARD_SECRET) return
    return Response.redirect(new URL("/login", req.url))
  }
  // Redirect unauthenticated users to /login
  if (!req.auth) {
    return Response.redirect(new URL("/login", req.url))
  }
})

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
