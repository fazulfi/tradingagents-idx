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
  userId: string
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

export interface IJobStore {
  createJob(ticker: string, date: string, model: string, debateRounds: number, userId: string): Promise<Job>
  getJob(id: string): Promise<Job | undefined>
  updateJob(id: string, partial: Partial<Job>): Promise<void>
  deleteJob(id: string): Promise<void>
  listJobs(userId?: string): Promise<Job[]>
  cleanupOldJobs(): Promise<void>
  getLastDiskWrite(): Date
}
