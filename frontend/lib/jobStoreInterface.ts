import type { Job } from "./jobStore"

export type { Job, JobStatus, Sections, TokenUsage, AgentTokens } from "./jobStore"
export { MAX_JOBS } from "./jobStore"

export interface IJobStore {
  createJob(ticker: string, date: string, model: string, debateRounds: number): Job
  getJob(id: string): Job | undefined
  updateJob(id: string, partial: Partial<Job>): void
  deleteJob(id: string): void
  listJobs(): Job[]
  cleanupOldJobs(): void
}
