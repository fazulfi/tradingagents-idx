import { prisma } from '@/lib/prisma'

export async function cleanStuckJobs(): Promise<void> {
  try {
    const result = await prisma.job.updateMany({
      where: { status: 'running' },
      data: {
        status: 'error',
        error: 'Job terminated: server was restarted while job was running',
        completedAt: new Date(),
      },
    })
    if (result.count > 0) {
      console.log(`[startup] Cleaned ${result.count} stuck running job(s)`)
    }
  } catch (err) {
    console.error('[startup] Failed to clean stuck jobs:', err)
  }
}
