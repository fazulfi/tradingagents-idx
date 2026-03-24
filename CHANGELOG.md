# Changelog

All notable changes to this project will be documented in this file.

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
