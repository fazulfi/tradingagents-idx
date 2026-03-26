import NextAuth from "next-auth"
import { authConfig } from "./auth.config"

const { auth } = NextAuth(authConfig)

export default auth((req) => {
  const { pathname } = req.nextUrl
  // Allow public paths
  if (
    pathname === "/login" ||
    pathname.startsWith("/api/auth") ||
    pathname === "/api/analyze"
  ) {
    return
  }
  // Redirect unauthenticated users to /login
  if (!req.auth) {
    return Response.redirect(new URL("/login", req.url))
  }
})

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
