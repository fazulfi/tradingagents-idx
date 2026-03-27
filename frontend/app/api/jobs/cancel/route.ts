import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthenticatedUserId } from "@/lib/authHelpers"

export async function DELETE(req: NextRequest) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const id = req.nextUrl.searchParams.get("id")
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 })

  const dbJob = await prisma.job.findFirst({ where: { id, userId } })
  if (!dbJob) return Response.json({ error: "Job not found" }, { status: 404 })

  // Kill the process if pid is stored in Prisma
  if (dbJob.pid) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    try { process.kill(dbJob.pid, "SIGTERM") } catch (_) {}
  }

  await prisma.job.update({ where: { id }, data: { status: "cancelled" } })

  return Response.json({ cancelled: true })
}
