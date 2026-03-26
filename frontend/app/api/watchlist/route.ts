import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthenticatedUserId } from "@/lib/authHelpers"
import { sanitizeTicker } from "@/lib/utils"

export async function GET(req: NextRequest) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const items = await prisma.watchlist.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { ticker: true, createdAt: true },
  })

  return Response.json(items.map((i) => i.ticker))
}

export async function POST(req: NextRequest) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 })

  let body: { ticker?: unknown }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const ticker = sanitizeTicker(typeof body.ticker === "string" ? body.ticker : null)
  if (!ticker) return Response.json({ error: "Invalid ticker" }, { status: 400 })

  try {
    await prisma.watchlist.create({ data: { userId, ticker } })
  } catch {
    // Unique constraint violation — ticker already in watchlist
    return Response.json({ error: "Ticker already in watchlist" }, { status: 409 })
  }

  return Response.json({ ok: true, ticker })
}

export async function DELETE(req: NextRequest) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 })

  let body: { ticker?: unknown }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const ticker = typeof body.ticker === "string" ? body.ticker.trim().toUpperCase() : null
  if (!ticker) return Response.json({ error: "Missing ticker" }, { status: 400 })

  await prisma.watchlist.deleteMany({ where: { userId, ticker } })

  return Response.json({ ok: true })
}
