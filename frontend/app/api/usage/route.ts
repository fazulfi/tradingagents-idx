import crypto from "crypto"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"

// Internal endpoint called by the Python worker to report IDX API usage.
// Auth: X-Internal-Secret header must match INTERNAL_SECRET env var.
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-internal-secret")
  const envSecret = process.env.INTERNAL_SECRET
  if (
    !secret ||
    !envSecret ||
    secret.length !== envSecret.length ||
    !crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(envSecret))
  ) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: { userId?: unknown; count?: unknown }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const userId = typeof body.userId === "string" ? body.userId : null
  const count = typeof body.count === "number" ? Math.max(0, Math.floor(body.count)) : 1

  if (!userId) return Response.json({ error: "Missing userId" }, { status: 400 })

  // Verify user exists
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) return Response.json({ error: "User not found" }, { status: 404 })

  await prisma.userSettings.upsert({
    where: { userId },
    update: { idxUsed: { increment: count } },
    create: { userId, idxUsed: count },
  })

  return Response.json({ ok: true })
}
