# Changelog

All notable changes to this project will be documented in this file.

## [1.6.0] - 2026-03-29

### Fixed
- **Usage counter → Prisma DB**: Migrated RapidAPI monthly usage counter to persistent Prisma SQLite storage, eliminating cross-process limit bypass and job resets.
- **Zombie jobs**: Added a 10-minute timeout to Python worker processes and a startup sequence cleaner (`instrumentation.ts`) that rescues frozen/running jobs across server restarts.
- **Hardcoded model fix**: Removed forced UI model override in `main.py` allowing proper passing of CLI arguments vs configuration.
- **Cache explosion fix**: Replaced naive cache dumping in RapidAPI caching with targeted expired key purging to reduce disk bloat and key redundancy.

## [1.5.0] - 2026-03-27

### Changed
- **Migrated job store from in-memory Map + `jobs.json` to SQLite via Prisma** — all job state (sections, logs, tokenUsage, verdict, error, pid) now persisted in the database and survives server restarts
- **Removed all `fs.writeFileSync`/`fs.readFileSync` from the request path** — no more event loop blocking on every job update; Prisma handles persistence asynchronously
- **Next.js process is now fully stateless** — in-flight streaming state is closure-scoped to the active request; completed results always readable from SQLite
- **Expanded Job schema** — added `sections`, `logs`, `tokenUsage`, `pid`, `debateRounds`, `verdict`, `error` columns for live streaming data
- **`status/route.ts`** — simplified to always read from Prisma (no more dual in-memory + DB lookup)
- **`cancel/route.ts`** — reads `pid` from Prisma to kill the subprocess; no in-memory fallback
- **`list/route.ts`** — reads `verdict` from dedicated DB column instead of parsing `result` JSON blob
- **`start/route.ts`** — concurrent job check now uses `prisma.job.count()` instead of in-memory Map iteration

### Removed
- `frontend/lib/jobStore.ts` — in-memory Map + `jobs.json` file-backed store deleted
- Global in-memory job tracking (Map) — replaced by closure-scoped local state during streaming + Prisma persistence
- Dual-write pattern (Map + SQLite) — single source of truth is now SQLite

## [1.4.0] - 2026-03-26

### Added
- **Authentication system** — NextAuth v5 (beta) with Credentials provider; JWT session strategy; login page at `/login` with dark glass-panel UI matching the dashboard theme
- **SQLite database** — Prisma 5.22 + SQLite (`frontend/prisma/dev.db`) for durable persistence of users, jobs, watchlist, and settings
- **Per-user data isolation** — all jobs, watchlist entries, and IDX quota are scoped to the authenticated user; admin user seeded via `npx tsx scripts/seed.ts` (password controlled by `ADMIN_PASSWORD` env var, warns loudly if default `password123` is used)
- **Watchlist** — persistent ticker watchlist stored in SQLite; `WatchlistPanel` component with add/remove chips and one-click ▶ analyze button
- **Per-user IDX quota tracking** — IDX API usage reported from Python subprocess to Next.js via `POST /api/usage` (authenticated with `X-Internal-Secret` header); stored in `UserSettings.idxUsed` in SQLite replacing the shared disk file
- **Login page** — `/login` with dark bg, dot-grid CSS, glass-panel card, green submit button, JetBrains Mono font; `x-api-key` header no longer required from the browser
- **User dropdown** — fixed top-right header showing username, role badge (ADMIN=green), and sign-out button
- `POST /api/usage` — internal endpoint for Python→Next.js IDX usage reporting; authenticated with `X-Internal-Secret`
- `GET/POST/DELETE /api/watchlist` — watchlist CRUD API, per-user scoped
- `frontend/auth.ts`, `frontend/auth.config.ts` — split NextAuth config (Edge-compatible base config for middleware; full Prisma+bcrypt config for API routes)
- `frontend/middleware.ts` — Edge-compatible auth middleware; redirects unauthenticated requests to `/login`; allows `/login`, `/api/auth/*`, `/api/analyze` without auth
- `frontend/lib/authHelpers.ts` — `getAuthenticatedUserId(req?)` helper: session-first, falls back to `x-api-key` → admin userId for backward compat
- `frontend/lib/prisma.ts` — singleton PrismaClient with global caching to survive Next.js hot-reload
- `frontend/scripts/seed.ts` — seeds admin user, migrates legacy `jobs.json` to SQLite

### Fixed
- **MARKET_ANALYST and SENTIMENT_ANALYST silently skipped** — `get_stock_data_online` and `get_news` tools used sync `requests` inside async LangGraph nodes, causing a coroutine conflict with the IDX async tool. Fixed by wrapping the sync tools in `asyncio.get_event_loop().run_in_executor(None, ...)` (ThreadPoolExecutor) inside the IDX async tool dispatcher so both sync and async tools can coexist in the same event loop.

### Security
- All API routes now require an authenticated session (NextAuth JWT) or a valid `x-api-key: <DASHBOARD_SECRET>` header (backward compat for CLI/scripts)
- Jobs are isolated per-user — users cannot read, cancel, or view jobs belonging to other users
- `INTERNAL_SECRET` env var protects the Python→Next.js `/api/usage` callback from external calls
- Passwords hashed with bcrypt (12 rounds)
- `ADMIN_PASSWORD` env var overrides the default seed password; server logs a loud warning if the default `password123` is used
- `NEXT_PUBLIC_DASHBOARD_SECRET` no longer required in the browser; removed from all client-side fetch calls

## [1.3.0] - 2026-03-25

### Added
- IDX Market Intelligence API integration via RapidAPI for `.JK` tickers (`tradingagents/dataflows/idx_rapidapi.py`, `tradingagents/dataflows/idx_rapidapi_tools.py`)
  - **Bandar Accumulation/Distribution** — detect if market makers are accumulating or distributing (Bandarmology)
  - **Smart Money Flow** — track institutional and foreign investor movement
  - **Pump & Dump Detection** — market manipulation risk signals
  - **Foreign Ownership Trends** — foreign investor stake monitoring
  - Rate limiting: 1 req/sec enforced, 1000 req/month with usage counter + auto-reset
  - Request caching: 1-hour TTL with in-memory and disk persistence (`~/.tradingagents_idx_cache.json`)
  - Monthly usage tracking with auto-reset (`~/.tradingagents_idx_usage.json`)
  - Graceful degradation: returns empty string when no API key set or for non-`.JK` tickers
  - IDX API usage badge in frontend header HUD (color-coded: blue / yellow >800 / red >950)
- `IDX_RAPIDAPI_KEY` added to `.env.example` with documentation
- IDX API usage exposed via `GET /api/jobs/metrics` (`idx_api` field)

## [1.2.0] - 2026-03-24

### Added
- Pluggable job store interface (`IJobStore`) with JSON (default) and Redis (experimental) backends (`frontend/lib/jobStoreInterface.ts`, `frontend/lib/jobStoreRedis.ts`)
- `getJobStore()` factory function — selects backend via `JOB_STORE_BACKEND` env var (`json` | `redis`)
- `REDIS_URL` env var support (default: `redis://localhost:6379`); falls back to JSON store if Redis unavailable
- Health/metrics endpoint: `GET /api/jobs/metrics` — returns total, byStatus, oldestJob, newestJob, lastDiskWrite, storeBackend, uptime, nodeVersion
- `lastDiskWrite` timestamp tracking in job store
- Fake TradingAgents subprocess for CI testing (`tests/fake_tradingagents.py`) — deterministic marker output, `--fail` flag for error path testing
- Job pipeline tests (`tests/test_job_pipeline.py`) — 8 pytest tests covering marker detection, JSON parsing, verdict detection, and exit code behaviour; no Next.js server required
- Architecture documentation (`docs/ARCHITECTURE.md`) — system diagram, marker protocol, context injection, extension guides
- Research workflow guide (`docs/RESEARCH_WORKFLOW.md`) — end-to-end example, Python notebook code, IDX data limitations, token cost reference
- `ioredis` optional dependency in `frontend/package.json`

## [1.1.0] - 2026-03-24

### Fixed
- Renamed package from `tradingagents` to `tradingagents-idx` in `pyproject.toml`
- Fixed `requirements.txt` to use proper editable install (`-e .`)
- Fixed `install.sh` to use `pip install -e .` instead of `pip install -r requirements.txt`

### Added
- Test suite for utility functions, exchange context detection, and indicator aliases (`tests/test_utils.py`, `tests/test_agents.py`)
- Manual test documentation for TypeScript job store (`tests/test_job_store_manual.md`)
- Important Disclaimers section in README (research-only, no financial advice, no live trading)
- Data limitations documentation for IDX and other non-US exchanges in README

## [1.0.2] - 2026-03-24

### Fixed
- Made Python path configurable via `PYTHON_PATH` env var with auto-detection
- Fixed `.gitignore` to properly track `frontend/lib` files

### Added
- `install.sh` automated setup script
- `start.sh` quick start script

## [1.0.1] - 2026-03-24

### Fixed
- Added missing `frontend/lib/jobStore.ts` and `frontend/lib/utils.ts`

## [1.0.0] - 2026-03-24

### Added
- Initial release with full web dashboard
- Background job queue with resume by ID
- Indonesian Stock Exchange (IDX) support
- OpenRouter integration with 349+ models
- Token usage tracking and cost estimation
- Session history and JSON export
- Browser notifications
- 5-tier verdict system (BUY / OVERWEIGHT / HOLD / UNDERWEIGHT / SELL)
