import { randomUUID } from "crypto"
import { prisma } from "./prisma"
import type { IJobStore, Job, JobStatus, Sections, TokenUsage } from "./jobStoreInterface"

function emptySections(): Sections {
  return {
    market_analyst: [],
    fundamentals_analyst: [],
    sentiment_analyst: [],
    news_analyst: [],
    bull_researcher: [],
    bear_researcher: [],
    research_decision: [],
    trader_decision: [],
    risk_aggressive: [],
    risk_neutral: [],
    risk_conservative: [],
    final_decision: [],
  }
}

function emptyTokenUsage(): TokenUsage {
  return { input: 0, output: 0, total: 0, elapsed_ms: 0, byAgent: {} }
}

type DbJob = {
  id: string
  userId: string
  ticker: string
  date: string
  model: string
  debateRounds: number
  status: string
  pid: number | null
  sections: string
  logs: string
  tokenUsage: string
  verdict: string | null
  error: string | null
  createdAt: Date
  updatedAt: Date
}

function parseJob(row: DbJob): Job {
  let sections: Sections
  let logs: string[]
  let tokenUsage: TokenUsage
  try { sections = JSON.parse(row.sections) as Sections } catch { sections = emptySections() }
  try { logs = JSON.parse(row.logs) as string[] } catch { logs = [] }
  try { tokenUsage = JSON.parse(row.tokenUsage) as TokenUsage } catch { tokenUsage = emptyTokenUsage() }
  return {
    id: row.id,
    userId: row.userId,
    ticker: row.ticker,
    date: row.date,
    model: row.model,
    debateRounds: row.debateRounds,
    status: row.status as JobStatus,
    pid: row.pid ?? undefined,
    sections,
    logs,
    tokenUsage,
    verdict: row.verdict ?? undefined,
    error: row.error ?? undefined,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  }
}

function serializePartial(partial: Partial<Job>): Record<string, unknown> {
  const data: Record<string, unknown> = {}
  if (partial.status !== undefined) data.status = partial.status
  if (partial.pid !== undefined) data.pid = partial.pid
  if (partial.verdict !== undefined) data.verdict = partial.verdict
  if (partial.error !== undefined) data.error = partial.error
  if (partial.sections !== undefined) data.sections = JSON.stringify(partial.sections)
  if (partial.logs !== undefined) data.logs = JSON.stringify(partial.logs)
  if (partial.tokenUsage !== undefined) data.tokenUsage = JSON.stringify(partial.tokenUsage)
  return data
}

export class PrismaJobStore implements IJobStore {
  async createJob(ticker: string, date: string, model: string, debateRounds: number, userId: string): Promise<Job> {
    const row = await prisma.job.create({
      data: {
        id: randomUUID(),
        userId,
        ticker,
        date,
        model,
        debateRounds,
        status: "pending",
        sections: "{}",
        logs: "[]",
        tokenUsage: "{}",
      },
    })
    return parseJob(row as DbJob)
  }

  async getJob(id: string): Promise<Job | undefined> {
    const row = await prisma.job.findUnique({ where: { id } })
    if (!row) return undefined
    return parseJob(row as DbJob)
  }

  async updateJob(id: string, partial: Partial<Job>): Promise<void> {
    const data = serializePartial(partial)
    if (Object.keys(data).length === 0) return
    await prisma.job.update({ where: { id }, data })
  }

  async deleteJob(id: string): Promise<void> {
    await prisma.job.delete({ where: { id } })
  }

  async listJobs(userId?: string): Promise<Job[]> {
    const rows = await prisma.job.findMany({
      where: userId ? { userId } : undefined,
      orderBy: { createdAt: "desc" },
    })
    return rows.map(r => parseJob(r as DbJob))
  }

  async cleanupOldJobs(): Promise<void> {
    const now = new Date()
    const twoHoursAgo = new Date(now.getTime() - 7_200_000)
    const thirtyMinutesAgo = new Date(now.getTime() - 1_800_000)

    // Mark stale running/pending jobs as error
    await prisma.job.updateMany({
      where: {
        status: { in: ["running", "pending"] },
        updatedAt: { lt: thirtyMinutesAgo },
      },
      data: { status: "error", error: "Job timed out (stale)" },
    })

    // Delete jobs older than 2 hours
    await prisma.job.deleteMany({
      where: { updatedAt: { lt: twoHoursAgo } },
    })
  }

  getLastDiskWrite(): Date {
    return new Date()
  }
}

let _store: PrismaJobStore | null = null

export function getJobStore(): IJobStore {
  if (process.env.JOB_STORE_BACKEND === "redis") {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { RedisJobStore } = require("./jobStoreRedis")
      return new RedisJobStore()
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_) {
      console.warn("[jobStore] Redis backend unavailable, falling back to Prisma store")
    }
  }
  if (!_store) _store = new PrismaJobStore()
  return _store
}
