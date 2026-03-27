import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthenticatedUserId } from "@/lib/authHelpers"
import type { JobStatus } from "@/lib/jobStoreInterface"

export async function GET(req: NextRequest) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const jobs = await prisma.job.findMany({ where: { userId } })

  const byStatus: Record<JobStatus, number> = {
    pending: 0, running: 0, complete: 0, error: 0, cancelled: 0,
  }
  for (const job of jobs) {
    const s = job.status as JobStatus
    if (s in byStatus) byStatus[s]++
  }

  let oldestJob: string | null = null
  let newestJob: string | null = null
  if (jobs.length > 0) {
    const sorted = [...jobs].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    oldestJob = sorted[0].createdAt.toISOString()
    newestJob = sorted[sorted.length - 1].createdAt.toISOString()
  }

  // Per-user IDX quota from UserSettings
  const settings = await prisma.userSettings.findUnique({ where: { userId } })
  const idxApi = {
    used: settings?.idxUsed ?? 0,
    limit: settings?.idxQuota ?? 1000,
    remaining: (settings?.idxQuota ?? 1000) - (settings?.idxUsed ?? 0),
    available: !!process.env.IDX_RAPIDAPI_KEY,
  }

  return NextResponse.json({
    total: jobs.length,
    byStatus,
    oldestJob,
    newestJob,
    storeBackend: "prisma",
    uptime: process.uptime(),
    nodeVersion: process.version,
    idx_api: idxApi,
  })
}
