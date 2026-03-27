// EXPERIMENTAL - not recommended for production
// Enable with: JOB_STORE_BACKEND=redis REDIS_URL=redis://localhost:6379

import type { IJobStore, Job } from "./jobStoreInterface"
import { PrismaJobStore } from "./jobStorePrisma"

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379"
const KEY_PREFIX = "ta:job:"
const INDEX_KEY = "ta:jobs"

function fallback(): IJobStore {
  return new PrismaJobStore()
}

export class RedisJobStore implements IJobStore {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any
  private ready = false
  private fb: IJobStore | null = null

  constructor() {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Redis = require("ioredis")
      this.client = new Redis(REDIS_URL, { lazyConnect: true, connectTimeout: 3000 })
      this.client.connect().then(() => {
        this.ready = true
      }).catch((err: Error) => {
        console.warn("[RedisJobStore] Connection failed:", err.message, "— using Prisma fallback")
        this.fb = fallback()
      })
      this.client.on("error", (err: Error) => {
        if (this.ready) {
          console.warn("[RedisJobStore] Redis error:", err.message)
          this.ready = false
          this.fb = fallback()
        }
      })
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (err) {
      console.warn("[RedisJobStore] ioredis not available — using Prisma fallback")
      this.fb = fallback()
    }
  }

  async createJob(ticker: string, date: string, model: string, debateRounds: number, userId: string): Promise<Job> {
    if (this.fb) return this.fb.createJob(ticker, date, model, debateRounds, userId)
    // Redis ops are async; create via Prisma and sync to Redis
    const job = await fallback().createJob(ticker, date, model, debateRounds, userId)
    this._setAsync(job).catch(() => {})
    return job
  }

  async getJob(id: string): Promise<Job | undefined> {
    if (this.fb) return this.fb.getJob(id)
    if (!this.ready) return fallback().getJob(id)
    try {
      const raw = await this.client.get(KEY_PREFIX + id)
      if (!raw) return undefined
      return JSON.parse(raw) as Job
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_) {
      return fallback().getJob(id)
    }
  }

  async updateJob(id: string, partial: Partial<Job>): Promise<void> {
    if (this.fb) return this.fb.updateJob(id, partial)
    await fallback().updateJob(id, partial)
    const job = await fallback().getJob(id)
    if (job) this._setAsync(job).catch(() => {})
  }

  async deleteJob(id: string): Promise<void> {
    if (this.fb) return this.fb.deleteJob(id)
    await fallback().deleteJob(id)
    if (this.ready) {
      this.client.del(KEY_PREFIX + id).catch(() => {})
      this.client.srem(INDEX_KEY, id).catch(() => {})
    }
  }

  async listJobs(userId?: string): Promise<Job[]> {
    if (this.fb) return this.fb.listJobs(userId)
    return fallback().listJobs(userId)
  }

  async cleanupOldJobs(): Promise<void> {
    if (this.fb) return this.fb.cleanupOldJobs()
    return fallback().cleanupOldJobs()
  }

  getLastDiskWrite(): Date {
    return new Date()
  }

  private async _setAsync(job: Job): Promise<void> {
    if (!this.ready) return
    await this.client.set(KEY_PREFIX + job.id, JSON.stringify(job))
    await this.client.sadd(INDEX_KEY, job.id)
  }
}
