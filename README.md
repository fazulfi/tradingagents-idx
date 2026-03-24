# tradingagents-idx

**TradingAgents with Web Dashboard & Indonesian Stock Exchange (IDX) Support**

[![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js&logoColor=white)](https://nextjs.org/)
[![OpenRouter](https://img.shields.io/badge/OpenRouter-349%2B%20models-6366f1)](https://openrouter.ai/)
[![LangGraph](https://img.shields.io/badge/LangGraph-multi--agent-1c7ed6)](https://github.com/langchain-ai/langgraph)
[![License](https://img.shields.io/badge/License-MIT-green)](./LICENSE)
[![Based on TradingAgents](https://img.shields.io/badge/Based%20on-TauricResearch%2FTradingAgents-orange)](https://github.com/TauricResearch/TradingAgents)

A fork of [TradingAgents by TauricResearch](https://github.com/TauricResearch/TradingAgents) that adds a full-featured **Next.js web dashboard**, a **background job queue** so analyses survive browser disconnects, and first-class support for the **Indonesian Stock Exchange (IDX/BEI)** — complete with IDR currency context, OJK regulatory awareness, and Bank Indonesia rate considerations. Global exchanges (.JK, .T, .HK, .TO, and US) are supported out of the box.

---

## 📸 Screenshots

> _Screenshot placeholders — add your own after running the dashboard._

| Dashboard (dark terminal UI) | Verdict Card |
|---|---|
| `assets/screenshots/dashboard.png` | `assets/screenshots/verdict.png` |

---

## ✨ Features

### Web Dashboard
- **Dark terminal UI** — monospace font, glass panels, animated agent indicators
- **Background job queue** — analysis runs as a Python subprocess; closing the browser tab does not cancel it
- **Resume by Job ID** — paste a job UUID at any time to reconnect to a running or completed analysis
- **Job persistence** — job state written to `jobs.json` on every update; survives server restarts (stale running jobs are automatically marked as errored)
- **Live log stream** — every section marker and status message shown in real time
- **Cancel running job** — sends `SIGTERM` to the Python subprocess cleanly

### AI Model Flexibility
- **349+ models via OpenRouter** — every model from OpenRouter's catalogue searchable by ID or name in the UI
- **Quick-thinking + Deep-thinking dual config** — same model used for both by default; override in config for cost/speed trade-offs
- **CLI also supports**: OpenAI, Anthropic, Google, xAI, Ollama (local models)
- **Provider-specific tuning**: OpenAI reasoning effort, Anthropic effort level, Google thinking level

### Analysis Controls
- **Debate rounds selector (1–5)** — controls depth of Bull vs Bear and risk management debates
- **Analyst team selection** — choose any combination of Market, Fundamentals, Sentiment, News analysts
- **5-tier verdict scale**: `BUY` / `OVERWEIGHT` / `HOLD` / `UNDERWEIGHT` / `SELL`
- **Analyst persona tuning** — agents never ask clarifying questions; always produce a decisive recommendation

### Token & Cost Tracking
- **Live token HUD** — input / output / total tokens updated per agent in the header
- **Per-agent token breakdown** — expandable table showing which agent consumed the most tokens
- **Cost estimation** — real-time cost calculated from OpenRouter's live pricing API
- **Pre-run estimate** — estimated tokens and cost shown before starting, based on prior runs or fallback values
- **Elapsed timer** — counts up while the job is running

### Session & Export
- **Session history (last 5 runs)** — ticker, date, model, tokens, cost, verdict, timestamp, elapsed time; expandable row for full details
- **Export analysis as JSON** — one click downloads all 12 agent reports plus token usage and cost
- **Browser notifications** — desktop notification fired when analysis completes or errors (with permission prompt)

### Indonesian Stock Exchange (IDX) Support
- **Exchange-aware context injection** — when a `.JK` ticker is detected, agents receive a full IDX briefing:
  - Currency: IDR (Indonesian Rupiah), not USD
  - Regulatory body: OJK (Otoritas Jasa Keuangan)
  - Key indices: IDX Composite (IHSG), LQ45, IDX80
  - Bank Indonesia interest rate considerations
  - Commodity impact: palm oil, coal, nickel
  - Accounting standard: PSAK (Indonesian GAAP / IFRS-aligned)
  - Common sector examples: BBCA, BBRI, BMRI, TLKM, ADRO, UNVR
- **Global exchange context**: Japanese TSE (.T → JPY), Hong Kong HKEX (.HK → HKD), Canada TSX (.TO → CAD)
- **Date context injection** — agents always know today's date and the analysis date; never ask for it
- **Language enforcement** — all agent output forced to English regardless of data source language

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Browser (Next.js 14)                     │
│                                                             │
│  Ticker / Date / Model / Rounds → POST /api/jobs/start      │
│  ← { jobId }                                                │
│                                                             │
│  GET /api/jobs/status?id=<jobId>  (every 2 seconds)         │
│  ← { status, sections, logs, tokenUsage, verdict }          │
└──────────────────────────┬──────────────────────────────────┘
                           │
                  ┌────────▼────────┐
                  │  Job Store       │
                  │  in-memory Map  │
                  │  + jobs.json    │
                  └────────┬────────┘
                           │  spawn Python subprocess
                  ┌────────▼────────────────────────────────────┐
                  │  Python script (inline, piped stdout)        │
                  │                                             │
                  │  TradingAgentsGraph (LangGraph)              │
                  │    │                                        │
                  │    ├── Market Analyst                       │
                  │    ├── Fundamentals Analyst                 │
                  │    ├── Sentiment Analyst                    │
                  │    ├── News Analyst                         │
                  │    │                                        │
                  │    ├── Bull Researcher  ─┐                  │
                  │    ├── Bear Researcher  ─┤ debate rounds    │
                  │    ├── Research Judge   ─┘                  │
                  │    │                                        │
                  │    ├── Trader                               │
                  │    │                                        │
                  │    ├── Risk: Aggressive ─┐                  │
                  │    ├── Risk: Neutral    ─┤ debate rounds    │
                  │    ├── Risk: Conservative─┘                 │
                  │    │                                        │
                  │    └── Portfolio Manager → VERDICT          │
                  │                                             │
                  │  [SECTION] markers → stdout                 │
                  │  [TOKEN_USAGE] JSON → stdout                │
                  └─────────────────────────────────────────────┘
```

**Data flow summary:**

```
Browser  →  POST /api/jobs/start  →  Job Queue (in-memory + jobs.json)
                                  →  Python subprocess → LangGraph → TradingAgents
Browser  →  GET /api/jobs/status every 2s  ←  parsed stdout sections + token data
```

---

## 📋 Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Python | 3.10+ | 3.13 recommended |
| Node.js | 20+ | For the Next.js dashboard |
| Conda | any | Miniconda recommended |
| OpenRouter API key | — | Required for the web dashboard; free tier available |
| Alpha Vantage API key | — | Optional; yfinance is used by default (no key needed) |

Get your keys:
- **OpenRouter**: https://openrouter.ai (free tier available, pay-per-token for premium models)
- **Alpha Vantage**: https://alphavantage.co (free tier: 25 requests/day)

---

## 🚀 Installation

### Quick Install

```bash
bash install.sh
```

This will create the `tradingagents` conda environment, install all dependencies, copy `.env.example` to `.env`, install frontend packages, and generate a random `DASHBOARD_SECRET` in `frontend/.env.local`.

After running, edit `.env` to add your API keys, then start the app:

```bash
bash start.sh
```

### Manual Installation

### 1. Clone the repository

```bash
git clone https://github.com/your-username/tradingagents-idx.git
cd tradingagents-idx
```

### 2. Create and activate a Python environment

```bash
conda create -n tradingagents python=3.13 -y
conda activate tradingagents
```

### 3. Install Python dependencies

```bash
pip install -e .
```

### 4. Configure API keys

```bash
cp .env.example .env
```

Edit `.env`:

```env
# Required for the web dashboard (OpenRouter)
OPENROUTER_API_KEY=sk-or-...

# Optional — only needed if using Alpha Vantage as data vendor
# ALPHA_VANTAGE_API_KEY=your_key_here

# Optional — for direct OpenAI / Anthropic / Google / xAI access via CLI
# OPENAI_API_KEY=
# ANTHROPIC_API_KEY=
# GOOGLE_API_KEY=
# XAI_API_KEY=
```

### 5. Install frontend dependencies

```bash
cd frontend
npm install
```

### 6. Configure the frontend

```bash
cp .env.example .env.local   # or create manually
```

Create `frontend/.env.local`:

```env
# Secret shared between the browser and the API routes (prevents unauthorized access)
DASHBOARD_SECRET=change-me-to-a-random-string
NEXT_PUBLIC_DASHBOARD_SECRET=change-me-to-a-random-string
```

> Both values must be identical. Use any random string — e.g. `openssl rand -hex 32`.

### 7. Start the application

**Terminal 1 — Next.js dashboard (from `frontend/`):**

```bash
cd frontend
npm run dev
```

The dashboard is now available at `http://localhost:3000`.

**No separate Python server is needed.** The dashboard spawns Python subprocesses on demand.

---

## ⚙️ Configuration

### Python backend (`tradingagents/default_config.py`)

| Key | Default | Description |
|---|---|---|
| `llm_provider` | `openai` | Provider: `openai`, `anthropic`, `google`, `xai`, `openrouter`, `ollama` |
| `deep_think_llm` | `gpt-5.2` | Model for deep-thinking agents (researchers, trader, portfolio manager) |
| `quick_think_llm` | `gpt-5-mini` | Model for quick-thinking agents (analysts) |
| `backend_url` | OpenAI endpoint | Override for custom or local endpoints |
| `max_debate_rounds` | `1` | Bull vs Bear researcher debate rounds |
| `max_risk_discuss_rounds` | `1` | Aggressive / Neutral / Conservative risk debate rounds |
| `data_vendors.core_stock_apis` | `yfinance` | `yfinance` or `alpha_vantage` |
| `data_vendors.technical_indicators` | `yfinance` | `yfinance` or `alpha_vantage` |
| `data_vendors.fundamental_data` | `yfinance` | `yfinance` or `alpha_vantage` |
| `data_vendors.news_data` | `yfinance` | `yfinance` or `alpha_vantage` |
| `google_thinking_level` | `None` | `"high"` or `"minimal"` (Google models) |
| `openai_reasoning_effort` | `None` | `"high"`, `"medium"`, `"low"` (OpenAI reasoning models) |
| `anthropic_effort` | `None` | `"high"`, `"medium"`, `"low"` (Claude 4.5+ models) |

### Environment variables (`.env`)

| Variable | Required | Description |
|---|---|---|
| `OPENROUTER_API_KEY` | Yes (dashboard) | OpenRouter API key |
| `OPENAI_API_KEY` | CLI only | OpenAI API key |
| `ANTHROPIC_API_KEY` | CLI only | Anthropic API key |
| `GOOGLE_API_KEY` | CLI only | Google Gemini API key |
| `XAI_API_KEY` | CLI only | xAI Grok API key |
| `PYTHON_PATH` | No | Path to Python interpreter (default: auto-detect) |

### Frontend environment variables (`frontend/.env.local`)

| Variable | Description |
|---|---|
| `DASHBOARD_SECRET` | Server-side secret for API route authentication |
| `NEXT_PUBLIC_DASHBOARD_SECRET` | Client-side copy of the same secret (must match) |

### Runtime context variables (set automatically by the dashboard)

These are injected by the job runner based on the ticker suffix — you do not set them manually:

| Variable | Description |
|---|---|
| `EXCHANGE_CONTEXT` | Exchange, currency, regulatory, and sector context for the agents |
| `DATE_CONTEXT` | Today's date and analysis date (prevents agents from asking) |
| `ANALYST_PERSONA` | Forces decisive analysis; suppresses clarifying questions |
| `LANGUAGE_INSTRUCTION` | Forces all agent output to English |

---

## 📊 Supported Markets

| Exchange | Suffix | Example | Currency | Notes |
|---|---|---|---|---|
| Indonesia IDX / BEI | `.JK` | `BBCA.JK` | IDR | Full OJK/Bank Indonesia context injected |
| US NYSE / NASDAQ | _(none)_ | `NVDA` | USD | Default |
| Japan TSE | `.T` | `7203.T` | JPY | |
| Hong Kong HKEX | `.HK` | `0700.HK` | HKD | |
| Canada TSX | `.TO` | `CNQ.TO` | CAD | |

Any ticker accepted by yfinance or Alpha Vantage can be used. The exchange context is injected automatically when the suffix is recognized.

---

## 🤖 AI Agents

The framework orchestrates five sequential stages, each with its own LangGraph subgraph:

### I. Analyst Team (parallel)
Four specialized analysts independently gather and synthesize data:

| Agent | Tools Used | Output |
|---|---|---|
| **Market Analyst** | `get_stock_data`, `get_indicators` | Price action, technical indicators, trend analysis |
| **Fundamentals Analyst** | `get_fundamentals`, `get_balance_sheet`, `get_cashflow`, `get_income_statement` | Financial health, valuation, earnings quality |
| **Sentiment Analyst** | `get_news` | Social media sentiment, market mood |
| **News Analyst** | `get_news`, `get_global_news`, `get_insider_transactions` | Recent news, insider activity, macro events |

### II. Research Team (Bull vs Bear debate)
- **Bull Researcher** — argues for a bullish position based on analyst reports
- **Bear Researcher** — argues for a bearish position
- **Research Judge** — synthesizes the debate into an investment plan
- Configurable debate rounds (1–5) control how many back-and-forth exchanges occur

### III. Trader
The trader reviews the investment plan, analyst reports, and past trading memories to produce a specific trade proposal.

### IV. Risk Management Team (three-way debate)
Three risk perspectives debate the trader's proposal:
- **Aggressive** — maximizes upside potential; minimizes position sizing caution
- **Neutral** — balances risk/reward
- **Conservative** — prioritizes capital preservation, flags downside scenarios

### V. Portfolio Manager
The portfolio manager synthesizes all inputs — analyst reports, debate history, trader plan, and risk assessment — to produce the **final verdict**:

| Rating | Meaning |
|---|---|
| 🟢 **BUY** | Strong conviction long position |
| 🟢 **OVERWEIGHT** | Positive bias, above-index allocation |
| 🟡 **HOLD** | Neutral; maintain current position |
| 🟠 **UNDERWEIGHT** | Negative bias, below-index allocation |
| 🔴 **SELL** | Strong conviction exit / short |

---

## 💡 Usage

### Web Dashboard

1. Open `http://localhost:3000`
2. Enter a ticker symbol (e.g. `BBCA.JK`, `NVDA`, `7203.T`)
3. Select the analysis date
4. Choose debate rounds (1 = fast/cheap, 5 = thorough/expensive)
5. Search for and select an AI model from the OpenRouter catalogue
6. Click **RUN ANALYSIS**
7. Watch each agent's output stream in real time
8. The **Portfolio Manager Verdict** card shows the final rating with color coding
9. Copy the Job ID to resume from another browser tab or after a page refresh
10. Click **Export JSON** to download the full analysis

### CLI

```bash
# Activate your conda environment first
conda activate tradingagents

# Interactive CLI
tradingagents

# Or run directly from Python
python main.py
```

The CLI prompts you to select a provider, models, analysts, and research depth interactively.

### Python API

```python
from tradingagents.graph.trading_graph import TradingAgentsGraph
from tradingagents.default_config import DEFAULT_CONFIG
from dotenv import load_dotenv

load_dotenv()

config = DEFAULT_CONFIG.copy()
config["llm_provider"]    = "openrouter"
config["deep_think_llm"]  = "google/gemini-2.5-flash"
config["quick_think_llm"] = "google/gemini-2.5-flash-lite"
config["max_debate_rounds"] = 2

ta = TradingAgentsGraph(debug=False, config=config)
final_state, decision = ta.propagate("BBCA.JK", "2025-01-15")
print(decision)
```

---

## 🔧 Development

### Run in development mode

```bash
# Terminal 1 — Python (no server needed, invoked on demand)
conda activate tradingagents

# Terminal 2 — Next.js
cd frontend
npm run dev
```

### Project structure

```
tradingagents-idx/
├── tradingagents/              # Core Python framework
│   ├── agents/
│   │   ├── analysts/           # Market, Fundamentals, Sentiment, News
│   │   ├── researchers/        # Bull, Bear
│   │   ├── trader/
│   │   ├── managers/           # Research Manager, Portfolio Manager
│   │   ├── risk_mgmt/          # Aggressive, Neutral, Conservative
│   │   └── utils/              # Agent state, tool definitions, context injection
│   ├── dataflows/              # yfinance & Alpha Vantage data adapters
│   ├── graph/                  # LangGraph setup, propagation, reflection
│   ├── llm_clients/            # OpenAI / Anthropic / Google / xAI / OpenRouter
│   └── default_config.py
│
├── frontend/                   # Next.js 14 web dashboard
│   ├── app/
│   │   ├── page.tsx            # Main dashboard UI
│   │   ├── layout.tsx
│   │   └── api/
│   │       └── jobs/
│   │           ├── start/      # POST — spawn Python subprocess, create job
│   │           ├── status/     # GET  — poll job state
│   │           ├── cancel/     # DELETE — SIGTERM + mark cancelled
│   │           └── list/       # GET — list all jobs
│   ├── components/
│   │   ├── AgentPanel.tsx      # Scrolling agent output panel
│   │   └── VerdictCard.tsx     # Final rating card with color coding
│   └── lib/
│       ├── jobStore.ts         # In-memory job map + jobs.json persistence
│       └── utils.ts            # Ticker/date sanitization, verdict detection
│
├── cli/                        # Interactive CLI (questionary + rich)
├── main.py                     # Quick-start Python script
├── .env.example                # API key template
└── jobs.json                   # Auto-generated job persistence file
```

### Key customization points

- **Add a new exchange**: Edit the `EXCHANGE_CONTEXT` injection block in `frontend/app/api/jobs/start/route.ts`
- **Change default model**: Update `model` initial state in `frontend/app/page.tsx`
- **Add a new analyst**: Implement in `tradingagents/agents/analysts/`, add to `TradingAgentsGraph._create_tool_nodes()` and `GraphSetup.setup_graph()`
- **Python path**: Set `PYTHON_PATH` in `.env` to override the auto-detected interpreter (e.g. `/home/user/miniconda3/bin/python`).

---

## 📜 Credits

This project is a fork of **[TradingAgents](https://github.com/TauricResearch/TradingAgents)** by [TauricResearch](https://github.com/TauricResearch). The original framework introduced the multi-agent LangGraph architecture for financial analysis.

**Additions in this fork:**

| Feature | Description |
|---|---|
| Next.js web dashboard | Full dark-theme terminal UI replacing the CLI as the primary interface |
| Background job queue | Python subprocess + in-memory/disk job store; analyses survive browser disconnects |
| Job resume by ID | Reconnect to any running or completed job by UUID |
| Indonesian IDX support | `.JK` tickers receive full IDR/OJK/Bank Indonesia/PSAK context |
| Multi-exchange context | `.T` (TSE), `.HK` (HKEX), `.TO` (TSX) exchange context injection |
| OpenRouter integration | 349+ models selectable from the UI with live pricing data |
| Live token tracking | Per-agent token usage (input/output/total) shown in the header HUD |
| Cost estimation | Pre-run and live cost calculated from OpenRouter pricing API |
| Session history | Last 5 analysis runs with tokens, cost, verdict, and elapsed time |
| JSON export | One-click download of all 12 agent reports + metadata |
| Browser notifications | Desktop notification on analysis complete or error |
| 5-tier verdict | BUY / OVERWEIGHT / HOLD / UNDERWEIGHT / SELL (extended from 3-tier) |
| Analyst persona | Agents never ask clarifying questions; always produce decisive output |
| Date context | Agents always know today's date; never ask for it |

---

## 📄 License

[MIT](./LICENSE)

---

*Based on [TradingAgents v0.2.2](https://github.com/TauricResearch/TradingAgents) by TauricResearch.*
