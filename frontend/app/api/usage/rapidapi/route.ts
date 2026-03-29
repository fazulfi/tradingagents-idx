import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7) // "2026-03"
}

const MONTHLY_LIMIT = 1000

// GET: check current usage
export async function GET() {
  const month = currentMonth()
  const record = await prisma.rapidApiUsage.findUnique({ where: { month } })
  const callCount = record?.callCount ?? 0
  return NextResponse.json({
    month,
    callCount,
    remaining: Math.max(0, MONTHLY_LIMIT - callCount),
    limitReached: callCount >= MONTHLY_LIMIT,
  })
}

// POST: increment usage by `calls` (default 5)
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const calls: number = body.calls ?? 5
  const month = currentMonth()

  const record = await prisma.rapidApiUsage.upsert({
    where: { month },
    update: { callCount: { increment: calls } },
    create: { month, callCount: calls },
  })

  return NextResponse.json({
    month,
    callCount: record.callCount,
    remaining: Math.max(0, MONTHLY_LIMIT - record.callCount),
  })
}
