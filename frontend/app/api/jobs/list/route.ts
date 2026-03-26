import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthenticatedUserId } from "@/lib/authHelpers"

export async function GET(req: NextRequest) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const jobs = await prisma.job.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  })

  return Response.json(
    jobs.map((job) => {
      let verdict: string | undefined
      if (job.status === "complete" && job.result) {
        try {
          const parsed = JSON.parse(job.result) as { verdict?: string }
          verdict = parsed.verdict
        } catch {
          verdict = undefined
        }
      }
      return {
        id: job.id,
        status: job.status,
        ticker: job.ticker,
        date: job.date,
        model: job.model,
        verdict,
        createdAt: job.createdAt.getTime(),
        updatedAt: job.updatedAt.getTime(),
      }
    })
  )
}
