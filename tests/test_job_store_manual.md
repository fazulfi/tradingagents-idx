# Manual Test Steps: Job Store (TypeScript)

Jest is not configured for standalone execution outside the Next.js app. Use these manual steps to verify job store behaviour.

## Prerequisites

```bash
cd frontend
npm run dev
```

Dashboard available at `http://localhost:3000`.

## Test Cases

### 1. Start a job and receive a job ID
- Submit a ticker (e.g. `NVDA`) with a valid date and model
- Expect: a UUID job ID returned immediately, analysis begins in background

### 2. Job persists across page refresh
- Note the job ID from step 1
- Refresh the browser
- Paste the job ID into "Resume by ID"
- Expect: job state (status, sections, logs) restored from `jobs.json`

### 3. Resume a completed job
- After analysis finishes, note the job ID
- Restart the Next.js server (`Ctrl+C`, `npm run dev`)
- Paste the job ID
- Expect: completed job with all sections visible; status = `completed`

### 4. Stale running jobs marked as errored on restart
- Start a job
- Kill the Next.js server before it finishes
- Restart the server
- Check `jobs.json` — the interrupted job's status should be `errored`

### 5. Cancel a running job
- Start a long-running analysis
- Click Cancel
- Expect: job status transitions to `cancelled`; Python subprocess receives SIGTERM

### 6. Invalid job ID returns 404
- GET `/api/jobs/status?id=nonexistent-uuid`
- Expect: `{ error: "Job not found" }` with HTTP 404
