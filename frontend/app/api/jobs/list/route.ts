import { NextRequest } from "next/server"
import { listJobs } from "@/lib/jobStore"

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("x-api-key")
  if (!process.env.DASHBOARD_SECRET || authHeader !== process.env.DASHBOARD_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const jobs = listJobs()
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(job => ({
      id: job.id,
      status: job.status,
      ticker: job.ticker,
      date: job.date,
      model: job.model,
      verdict: job.verdict,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      totalTokens: job.tokenUsage.total,
    }))

  return Response.json(jobs)
}
