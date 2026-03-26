// EXPERIMENTAL - not recommended for production
// Enable with: JOB_STORE_BACKEND=redis REDIS_URL=redis://localhost:6379

import type { IJobStore } from "./jobStoreInterface"
import type { Job } from "./jobStore"
import { createJob as jsonCreateJob, getJob as jsonGetJob, updateJob as jsonUpdateJob, deleteJob as jsonDeleteJob, listJobs as jsonListJobs, cleanupOldJobs as jsonCleanupOldJobs } from "./jobStore"

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379"
const KEY_PREFIX = "ta:job:"
const INDEX_KEY = "ta:jobs"

function fallback(): IJobStore {
  return { createJob: jsonCreateJob, getJob: jsonGetJob, updateJob: jsonUpdateJob, deleteJob: jsonDeleteJob, listJobs: jsonListJobs, cleanupOldJobs: jsonCleanupOldJobs }
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
        console.warn("[RedisJobStore] Connection failed:", err.message, "— using JSON fallback")
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
      console.warn("[RedisJobStore] ioredis not available — using JSON fallback")
      this.fb = fallback()
    }
  }

  createJob(ticker: string, date: string, model: string, debateRounds: number): Job {
    if (this.fb) return this.fb.createJob(ticker, date, model, debateRounds)
    // Synchronous fallback: Redis ops are async, so we delegate to JSON store
    // and fire-and-forget a background sync. For truly async Redis, migrate to
    // Next.js Route Handlers with await.
    const job = jsonCreateJob(ticker, date, model, debateRounds)
    this._setAsync(job).catch(() => {})
    return job
  }

  getJob(id: string): Job | undefined {
    if (this.fb) return this.fb.getJob(id)
    return jsonGetJob(id)
  }

  updateJob(id: string, partial: Partial<Job>): void {
    if (this.fb) return this.fb.updateJob(id, partial)
    jsonUpdateJob(id, partial)
    const job = jsonGetJob(id)
    if (job) this._setAsync(job).catch(() => {})
  }

  deleteJob(id: string): void {
    if (this.fb) return this.fb.deleteJob(id)
    jsonDeleteJob(id)
    if (this.ready) {
      this.client.del(KEY_PREFIX + id).catch(() => {})
      this.client.srem(INDEX_KEY, id).catch(() => {})
    }
  }

  listJobs(): Job[] {
    if (this.fb) return this.fb.listJobs()
    return jsonListJobs()
  }

  cleanupOldJobs(): void {
    if (this.fb) return this.fb.cleanupOldJobs()
    jsonCleanupOldJobs()
  }

  private async _setAsync(job: Job): Promise<void> {
    if (!this.ready) return
    await this.client.set(KEY_PREFIX + job.id, JSON.stringify(job))
    await this.client.sadd(INDEX_KEY, job.id)
  }
}
