# Changelog

All notable changes to this project will be documented in this file.

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
