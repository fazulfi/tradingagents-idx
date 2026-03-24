import { NextRequest } from "next/server"
import { getJob } from "@/lib/jobStore"

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("x-api-key")
  if (!process.env.DASHBOARD_SECRET || authHeader !== process.env.DASHBOARD_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const id = req.nextUrl.searchParams.get("id")
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 })

  const job = getJob(id)
  if (!job) return Response.json({ error: "Job not found" }, { status: 404 })

  const { pid: _pid, ...safeJob } = job
  return Response.json(safeJob)
}
