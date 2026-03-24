import { randomUUID } from "crypto"
import fs from "fs"
import path from "path"

export const MAX_JOBS = 10

export type JobStatus = "pending" | "running" | "complete" | "error" | "cancelled"

export type AgentTokens = {
  input: number
  output: number
  total: number
  elapsed_ms: number
}

export type Sections = {
  market_analyst: string[]
  fundamentals_analyst: string[]
  sentiment_analyst: string[]
  news_analyst: string[]
  bull_researcher: string[]
  bear_researcher: string[]
  research_decision: string[]
  trader_decision: string[]
  risk_aggressive: string[]
  risk_neutral: string[]
  risk_conservative: string[]
  final_decision: string[]
}

export type TokenUsage = {
  input: number
  output: number
  total: number
  elapsed_ms: number
  byAgent: Record<string, AgentTokens>
}

export type Job = {
  id: string
  status: JobStatus
  ticker: string
  date: string
  model: string
  debateRounds: number
  createdAt: number
  updatedAt: number
  pid?: number
  sections: Sections
  logs: string[]
  tokenUsage: TokenUsage
  error?: string
  verdict?: string
}

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

const STORE_PATH = path.join(process.cwd(), "..", "jobs.json")

const jobs = new Map<string, Job>()

let lastDiskWrite: number | null = null

export function getLastDiskWrite(): number | null {
  return lastDiskWrite
}

function saveToDisk(): void {
  try {
    fs.writeFileSync(STORE_PATH, JSON.stringify(Array.from(jobs.entries())), "utf8")
    lastDiskWrite = Date.now()
  } catch (_) {}
}

function loadFromDisk(): void {
  try {
    const raw = fs.readFileSync(STORE_PATH, "utf8")
    const entries = JSON.parse(raw) as [string, Job][]
    const now = Date.now()
    const FIVE_MINUTES = 300_000
    for (const [id, job] of entries) {
      if ((job.status === "running" || job.status === "pending") && job.updatedAt < now - FIVE_MINUTES) {
        job.status = "error"
        job.error = "Server restarted while job was running"
      }
      jobs.set(id, job)
    }
  } catch (_) {}
}

loadFromDisk()

export function cleanupOldJobs(): void {
  const now = Date.now()
  const TWO_HOURS = 7_200_000
  const THIRTY_MINUTES = 1_800_000
  let dirty = false
  for (const [id, job] of jobs) {
    if (job.updatedAt < now - TWO_HOURS) {
      jobs.delete(id)
      dirty = true
    } else if (job.status === "running" && job.updatedAt < now - THIRTY_MINUTES) {
      job.status = "error"
      job.error = "Job timed out (stale)"
      job.updatedAt = now
      dirty = true
    }
  }
  if (dirty) saveToDisk()
}

export function createJob(ticker: string, date: string, model: string, debateRounds: number): Job {
  cleanupOldJobs()
  const now = Date.now()
  const job: Job = {
    id: randomUUID(),
    status: "pending",
    ticker,
    date,
    model,
    debateRounds,
    createdAt: now,
    updatedAt: now,
    sections: emptySections(),
    logs: [],
    tokenUsage: { input: 0, output: 0, total: 0, elapsed_ms: 0, byAgent: {} },
  }
  jobs.set(job.id, job)
  saveToDisk()
  return job
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id)
}

export function updateJob(id: string, partial: Partial<Job>): void {
  const job = jobs.get(id)
  if (!job) return
  Object.assign(job, partial)
  job.updatedAt = Date.now()
  saveToDisk()
}

export function deleteJob(id: string): void {
  jobs.delete(id)
  saveToDisk()
}

export function listJobs(): Job[] {
  return Array.from(jobs.values())
}

export function getJobStore() {
  const backend = process.env.JOB_STORE_BACKEND || "json"
  if (backend === "redis") {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { RedisJobStore } = require("./jobStoreRedis")
      return new RedisJobStore()
    } catch (_) {
      console.warn("[jobStore] Redis backend unavailable, falling back to JSON store")
    }
  }
  return { createJob, getJob, updateJob, deleteJob, listJobs, cleanupOldJobs }
}
