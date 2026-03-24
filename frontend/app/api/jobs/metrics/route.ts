import { NextRequest, NextResponse } from "next/server"
import { listJobs, getLastDiskWrite, getJobStore } from "@/lib/jobStore"
import type { JobStatus } from "@/lib/jobStore"

export async function GET(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key")
  if (!apiKey || apiKey !== process.env.DASHBOARD_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const jobs = listJobs()

  const byStatus: Record<JobStatus, number> = {
    pending: 0,
    running: 0,
    complete: 0,
    error: 0,
    cancelled: 0,
  }
  for (const job of jobs) {
    byStatus[job.status]++
  }

  let oldestJob: string | null = null
  let newestJob: string | null = null
  if (jobs.length > 0) {
    const sorted = [...jobs].sort((a, b) => a.createdAt - b.createdAt)
    oldestJob = new Date(sorted[0].createdAt).toISOString()
    newestJob = new Date(sorted[sorted.length - 1].createdAt).toISOString()
  }

  const lastDiskWrite = getLastDiskWrite()
  const backend = process.env.JOB_STORE_BACKEND === "redis" ? "redis" : "json"

  // Validate the store is accessible (calls getJobStore() for side-effect check)
  getJobStore()

  return NextResponse.json({
    total: jobs.length,
    byStatus,
    oldestJob,
    newestJob,
    lastDiskWrite: lastDiskWrite ? new Date(lastDiskWrite).toISOString() : null,
    storeBackend: backend,
    uptime: process.uptime(),
    nodeVersion: process.version,
  })
}
