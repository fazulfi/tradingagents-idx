export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { cleanStuckJobs } = await import('./lib/startup-cleanup')
    await cleanStuckJobs()
  }
}
