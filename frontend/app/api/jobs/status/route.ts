import { NextRequest } from "next/server"
import { getJob } from "@/lib/jobStore"
import { prisma } from "@/lib/prisma"
import { getAuthenticatedUserId } from "@/lib/authHelpers"

export async function GET(req: NextRequest) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const id = req.nextUrl.searchParams.get("id")
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 })

  // Check in-memory store first (live streaming data)
  const liveJob = getJob(id)
  if (liveJob) {
    // Verify ownership via Prisma
    const dbJob = await prisma.job.findFirst({ where: { id, userId } })
    if (!dbJob) return Response.json({ error: "Job not found" }, { status: 404 })

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { pid: _pid, ...safeJob } = liveJob
    return Response.json(safeJob)
  }

  // Fall back to persisted result in Prisma
  const dbJob = await prisma.job.findFirst({ where: { id, userId } })
  if (!dbJob) return Response.json({ error: "Job not found" }, { status: 404 })

  // Parse stored result if available
  let parsed: object = {}
  if (dbJob.result) {
    try {
      parsed = JSON.parse(dbJob.result)
    } catch {
      parsed = {}
    }
  }

  return Response.json({
    id: dbJob.id,
    status: dbJob.status,
    ticker: dbJob.ticker,
    date: dbJob.date,
    model: dbJob.model,
    createdAt: dbJob.createdAt.getTime(),
    updatedAt: dbJob.updatedAt.getTime(),
    ...parsed,
  })
}
