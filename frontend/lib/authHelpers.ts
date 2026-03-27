import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"

/**
 * Returns the authenticated userId for an incoming request.
 *
 * Priority:
 * 1. NextAuth session (JWT cookie) — used by browser clients
 * 2. x-cli-user-id header — injected by middleware after validating x-api-key
 *    (avoids Prisma query; requires ADMIN_USER_ID env var to be set)
 * 3. x-api-key header matching DASHBOARD_SECRET — fallback when ADMIN_USER_ID not set
 *    → resolves to the first ADMIN user's id via Prisma
 *
 * Returns null if neither is present or valid.
 */
export async function getAuthenticatedUserId(req?: Request): Promise<string | null> {
  // 1. Session
  const session = await auth()
  if (session?.user?.id) return session.user.id

  if (req) {
    // 2. CLI header injected by middleware after x-api-key validation
    const cliUserId = req.headers.get("x-cli-user-id")
    if (cliUserId) return cliUserId

    // 3. Direct x-api-key fallback (if ADMIN_USER_ID not configured)
    const apiKey = req.headers.get("x-api-key")
    if (apiKey && process.env.DASHBOARD_SECRET && apiKey === process.env.DASHBOARD_SECRET) {
      const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } })
      return admin?.id ?? null
    }
  }

  return null
}
