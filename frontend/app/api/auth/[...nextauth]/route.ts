import { handlers } from "@/auth"
import { NextRequest } from "next/server"

const WINDOW_MS = 15 * 60 * 1000
const MAX_ATTEMPTS = 5

const attempts = new Map<string, { count: number; resetAt: number }>()

export const GET = handlers.GET

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown"

  // Prune stale entry
  const now = Date.now()
  const entry = attempts.get(ip)
  if (entry && now > entry.resetAt) attempts.delete(ip)

  // Rate limit check
  const current = attempts.get(ip)
  if (current && current.count >= MAX_ATTEMPTS) {
    return Response.json(
      { error: "Too many attempts, try again later" },
      { status: 429 }
    )
  }

  // Delegate to NextAuth
  const res = await handlers.POST(req)

  // Inspect result to track failures / reset on success
  try {
    const body = await res.clone().json()
    if (body?.error) {
      // Failed attempt — increment counter
      const e = attempts.get(ip)
      if (e) {
        e.count++
      } else {
        attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS })
      }
    } else {
      // Successful login — reset counter
      attempts.delete(ip)
    }
  } catch {
    // Non-JSON response — don't touch counter
  }

  return res
}
