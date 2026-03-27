import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthenticatedUserId } from "@/lib/authHelpers"
import type { Sections, TokenUsage } from "@/lib/jobStoreInterface"

function safeParse<T>(json: string, fallback: T): T {
  try { return JSON.parse(json) as T } catch { return fallback }
}

const emptySections = (): Sections => ({
  market_analyst: [], fundamentals_analyst: [], sentiment_analyst: [], news_analyst: [],
  bull_researcher: [], bear_researcher: [], research_decision: [], trader_decision: [],
  risk_aggressive: [], risk_neutral: [], risk_conservative: [], final_decision: [],
})

const emptyTokenUsage = (): TokenUsage => ({ input: 0, output: 0, total: 0, elapsed_ms: 0, byAgent: {} })

export async function GET(req: NextRequest) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const id = req.nextUrl.searchParams.get("id")
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 })

  const dbJob = await prisma.job.findFirst({ where: { id, userId } })
  if (!dbJob) return Response.json({ error: "Job not found" }, { status: 404 })

  // Parse live streaming fields stored as JSON strings
  const sections = safeParse<Sections>(dbJob.sections ?? "{}", emptySections())
  const logs = safeParse<string[]>(dbJob.logs ?? "[]", [])
  const tokenUsage = safeParse<TokenUsage>(dbJob.tokenUsage ?? "{}", emptyTokenUsage())

  return Response.json({
    id: dbJob.id,
    status: dbJob.status,
    ticker: dbJob.ticker,
    date: dbJob.date,
    model: dbJob.model,
    debateRounds: dbJob.debateRounds,
    createdAt: dbJob.createdAt.getTime(),
    updatedAt: dbJob.updatedAt.getTime(),
    sections,
    logs,
    tokenUsage,
    verdict: dbJob.verdict ?? undefined,
    error: dbJob.error ?? undefined,
  })
}
