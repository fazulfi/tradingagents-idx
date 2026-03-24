import { NextRequest } from "next/server"
import { getJob, updateJob } from "@/lib/jobStore"

export async function DELETE(req: NextRequest) {
  const authHeader = req.headers.get("x-api-key")
  if (!process.env.DASHBOARD_SECRET || authHeader !== process.env.DASHBOARD_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const id = req.nextUrl.searchParams.get("id")
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 })

  const job = getJob(id)
  if (!job) return Response.json({ error: "Job not found" }, { status: 404 })

  if (job.pid) {
    try { process.kill(job.pid, "SIGTERM") } catch (_) {}
  }
  updateJob(id, { status: "cancelled" })

  return Response.json({ cancelled: true })
}
