# Architecture

## System Overview

```
Browser
  │
  ├─ POST /api/jobs/start  ──────────────────────────────────────────────┐
  │   { ticker, date, model, debate_rounds }                              │
  │                                                                       ▼
  │                                                              jobStore (Map + jobs.json)
  │                                                                       │
  │                                                              Python subprocess (spawn)
  │                                                                       │
  │                                                              TradingAgents LangGraph
  │                                              ┌────────────────────────────────────────┐
  │                                              │  Analyst Team                          │
  │                                              │  Market | Fundamentals                 │
  │                                              │  Sentiment | News                      │
  │                                              ├────────────────────────────────────────┤
  │                                              │  Research Team                         │
  │                                              │  Bull Researcher vs Bear Researcher    │
  │                                              │  (N debate rounds)                     │
  │                                              │  Research Manager Decision             │
  │                                              ├────────────────────────────────────────┤
  │                                              │  Trading Desk                          │
  │                                              │  Trader Decision                       │
  │                                              ├────────────────────────────────────────┤
  │                                              │  Risk Management                       │
  │                                              │  Aggressive | Neutral | Conservative   │
  │                                              │  (N debate rounds)                     │
  │                                              ├────────────────────────────────────────┤
  │                                              │  Portfolio Manager                     │
  │                                              │  Final Verdict                         │
  │                                              └────────────────────────────────────────┘
  │                                                                       │
  │                                                              stdout markers → jobStore
  │
  └─ GET /api/jobs/status?id=<jobId>  (polls every 2 s)
      GET /api/jobs/list
      DELETE /api/jobs/cancel?id=<jobId>
      GET /api/jobs/metrics
```

## Job Lifecycle

```
pending → running → complete
                 → error
                 → cancelled
```

- `pending`: Job created, subprocess not yet started.
- `running`: Subprocess active, streaming output.
- `complete`: `[COMPLETE]` marker received, exit 0.
- `error`: `[ERROR]` marker received, subprocess exited non-zero, or timeout.
- `cancelled`: Client sent DELETE /api/jobs/cancel; SIGTERM sent to subprocess.

Jobs older than 2 hours are auto-deleted. Running jobs stale for 30 minutes are marked `error`.

## Output Markers

The Python subprocess communicates with the Next.js job runner via stdout markers:

| Marker | Meaning |
|--------|---------|
| `[STATUS] <text>` | Log message appended to `job.logs` |
| `[MARKET_ANALYST]` | Begins market analysis section |
| `[FUNDAMENTALS_ANALYST]` | Begins fundamentals section |
| `[SENTIMENT_ANALYST]` | Begins sentiment section |
| `[NEWS_ANALYST]` | Begins news section |
| `[BULL_RESEARCHER]` | Begins bull research section |
| `[BEAR_RESEARCHER]` | Begins bear research section |
| `[RESEARCH_DECISION]` | Begins research manager decision |
| `[TRADER_DECISION]` | Begins trader decision |
| `[RISK_AGGRESSIVE]` | Begins aggressive risk analysis |
| `[RISK_NEUTRAL]` | Begins neutral risk analysis |
| `[RISK_CONSERVATIVE]` | Begins conservative risk analysis |
| `[FINAL_DECISION]` | Begins portfolio manager verdict |
| `[TOKEN_USAGE] <json>` | Per-agent token metrics |
| `[TOKEN_TOTAL] <json>` | Total token summary |
| `[ERROR] <text>` | Error message; sets job status to `error` |
| `[COMPLETE]` | Success; sets job status to `complete` |

Lines between section markers are accumulated in `job.sections.<section_key>`.

## Context Injection

The inline Python script receives four environment variables to guide LLM behaviour:

| Variable | Purpose |
|----------|---------|
| `EXCHANGE_CONTEXT` | Market-specific context (currency, regulator, settlement cycle) injected per ticker suffix: `.JK` → IDX/IDR/OJK, `.T` → TSE/JPY, `.HK` → HKEX/HKD, `.TO` → TSX/CAD |
| `DATE_CONTEXT` | Today's date and the requested analysis date, preventing hallucinated dates |
| `ANALYST_PERSONA` | Instructs agents to be decisive and avoid asking clarifying questions |
| `LANGUAGE_INSTRUCTION` | Forces English output regardless of model locale |

All four are prepended to the system prompt via `build_instrument_context()` in `tradingagents/agents/utils/`.

## Key File Locations

| Component | File |
|-----------|------|
| Job store (JSON backend) | `frontend/lib/jobStore.ts` |
| Job store interface | `frontend/lib/jobStoreInterface.ts` |
| Redis backend (experimental) | `frontend/lib/jobStoreRedis.ts` |
| Job API routes | `frontend/app/api/jobs/` |
| Verdict detection | `frontend/lib/utils.ts` → `detectVerdict()` |
| LangGraph orchestrator | `tradingagents/graph/trading_graph.py` |
| Agent state definitions | `tradingagents/agents/utils/agent_states.py` |
| Data providers | `tradingagents/dataflows/` |

## Extension Guide

### Add a new exchange context

In `frontend/app/api/jobs/start/route.ts`, locate the `EXCHANGE_CONTEXT` block and add a new `elif`:

```python
elif ticker.endswith('.SI'):
    exchange_context = "SGX (Singapore Exchange). Currency: SGD. Regulator: MAS."
```

### Plug in a new data vendor

1. Create `tradingagents/dataflows/my_vendor.py` implementing the abstract `DataProvider` interface from `tradingagents/dataflows/interface.py`.
2. Register the vendor in `tradingagents/dataflows/config.py`.
3. Set `DATA_PROVIDER=my_vendor` in your `.env`.

### Change the job store backend

```bash
# Use Redis (experimental)
JOB_STORE_BACKEND=redis REDIS_URL=redis://localhost:6379 npm start

# Default JSON store
JOB_STORE_BACKEND=json npm start
```

If Redis is unavailable at startup, the server logs a warning and falls back to the JSON store automatically.

### Extend the verdict system

Edit `detectVerdict()` in `frontend/lib/utils.ts`. The function scans the `FINAL_DECISION` section text for known keywords in priority order. Add new verdicts before the fallback `"—"` return.

```ts
if (text.includes("ACCUMULATE")) return "ACCUMULATE"
```
