import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"

/**
 * Returns the authenticated userId for an incoming request.
 *
 * Priority:
 * 1. NextAuth session (JWT cookie) — used by browser clients
 * 2. x-api-key header matching DASHBOARD_SECRET — backward compat for CLI / external callers
 *    → resolves to the first ADMIN user's id
 *
 * Returns null if neither is present or valid.
 */
export async function getAuthenticatedUserId(req?: Request): Promise<string | null> {
  // 1. Session
  const session = await auth()
  if (session?.user?.id) return session.user.id

  // 2. API key fallback
  if (req) {
    const apiKey = req.headers.get("x-api-key")
    if (apiKey && process.env.DASHBOARD_SECRET && apiKey === process.env.DASHBOARD_SECRET) {
      const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } })
      return admin?.id ?? null
    }
  }

  return null
}
