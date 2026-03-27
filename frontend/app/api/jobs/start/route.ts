import { NextRequest } from "next/server"
import { randomUUID } from "crypto"
import { spawn } from "child_process"
import path from "path"
import { sanitizeTicker, sanitizeDate, detectVerdict } from "@/lib/utils"
import { MAX_JOBS, type Sections, type TokenUsage } from "@/lib/jobStoreInterface"
import { prisma } from "@/lib/prisma"
import { getAuthenticatedUserId } from "@/lib/authHelpers"

function emptySections(): Sections {
  return {
    market_analyst: [],
    fundamentals_analyst: [],
    sentiment_analyst: [],
    news_analyst: [],
    bull_researcher: [],
    bear_researcher: [],
    research_decision: [],
    trader_decision: [],
    risk_aggressive: [],
    risk_neutral: [],
    risk_conservative: [],
    final_decision: [],
  }
}

function emptyTokenUsage(): TokenUsage {
  return { input: 0, output: 0, total: 0, elapsed_ms: 0, byAgent: {} }
}

export async function POST(req: NextRequest) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 })

  let body: { ticker?: unknown; date?: unknown; model?: unknown; debate_rounds?: unknown }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const ticker = sanitizeTicker(typeof body.ticker === "string" ? body.ticker : null)
  const date = sanitizeDate(typeof body.date === "string" ? body.date : null)
  const modelRaw = typeof body.model === "string" ? body.model : "google/gemini-2.0-flash-001"
  const model = modelRaw.slice(0, 100).replace(/[^a-zA-Z0-9\-\/_\.]/g, "")
  const debateRoundsRaw = parseInt(typeof body.debate_rounds === "string" ? body.debate_rounds : "1")
  const debateRounds = isNaN(debateRoundsRaw) ? 1 : Math.min(Math.max(debateRoundsRaw, 1), 5)

  if (!ticker) return Response.json({ error: "Invalid ticker" }, { status: 400 })
  if (!date) return Response.json({ error: "Invalid date" }, { status: 400 })

  // Check concurrent job limit via Prisma (per-user)
  const activeCount = await prisma.job.count({
    where: { userId, status: { in: ["running", "pending"] } },
  })
  if (activeCount >= MAX_JOBS) {
    return Response.json(
      { error: "Too many concurrent jobs. Please wait or cancel an existing job." },
      { status: 429 }
    )
  }

  const jobId = randomUUID()
  await prisma.job.create({
    data: {
      id: jobId,
      userId,
      ticker,
      date,
      model,
      debateRounds,
      status: "pending",
      sections: "{}",
      logs: "[]",
      tokenUsage: "{}",
    },
  })

  const pythonPath = process.env.PYTHON_PATH ||
    (() => {
      const candidates = [
        "/root/miniconda3/bin/python",
        "/home/" + process.env.USER + "/miniconda3/bin/python",
        "/opt/miniconda3/bin/python",
        "/usr/local/bin/python3",
        "/usr/bin/python3",
        "python3",
        "python"
      ]
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { execSync } = require("child_process")
      for (const candidate of candidates) {
        try {
          execSync(candidate + " --version", { stdio: "ignore" })
          return candidate
        } catch {}
      }
      return "python3"
    })()
  const projectRoot = path.resolve(path.join(process.cwd(), ".."))

  const script = `
import sys, os, re

ticker        = sys.argv[1]
date          = sys.argv[2]
root          = sys.argv[3]
model         = sys.argv[4] if len(sys.argv) > 4 else "google/gemini-2.0-flash-001"
debate_rounds = int(sys.argv[5]) if len(sys.argv) > 5 else 1
user_id       = sys.argv[6] if len(sys.argv) > 6 else ""
internal_secret = sys.argv[7] if len(sys.argv) > 7 else ""

if not re.match(r"^[A-Z0-9.\\-]{1,12}$", ticker):
    print("[ERROR] Invalid ticker", flush=True)
    sys.exit(1)

if not re.match(r"^\\d{4}-\\d{2}-\\d{2}$", date):
    print("[ERROR] Invalid date", flush=True)
    sys.exit(1)

sys.path.insert(0, root)
os.chdir(root)

from dotenv import load_dotenv
load_dotenv()

# Pass user context to Python backend for usage reporting
if user_id:
    os.environ["IDX_USER_ID"] = user_id
if internal_secret:
    os.environ["INTERNAL_SECRET"] = internal_secret

import time, json, threading
from langchain_core.callbacks import BaseCallbackHandler
from langchain_core.outputs import LLMResult

class StatsCallbackHandler(BaseCallbackHandler):
    def __init__(self):
        super().__init__()
        self._lock = threading.Lock()
        self.tokens_in = 0
        self.tokens_out = 0
    def on_chat_model_start(self, serialized, messages, **kwargs):
        pass
    def on_llm_end(self, response: LLMResult, **kwargs):
        try:
            gen = response.generations[0][0]
        except (IndexError, TypeError):
            return
        if hasattr(gen, "message") and hasattr(gen.message, "usage_metadata"):
            md = gen.message.usage_metadata or {}
            with self._lock:
                self.tokens_in  += md.get("input_tokens", 0)
                self.tokens_out += md.get("output_tokens", 0)
    def snapshot(self):
        with self._lock:
            return {"tokens_in": self.tokens_in, "tokens_out": self.tokens_out}

from tradingagents.graph.trading_graph import TradingAgentsGraph
from tradingagents.default_config import DEFAULT_CONFIG

config = DEFAULT_CONFIG.copy()
config["llm_provider"]            = "openrouter"
config["deep_think_llm"]          = model
config["quick_think_llm"]         = model
config["max_debate_rounds"]       = debate_rounds
config["max_risk_discuss_rounds"] = debate_rounds

# Detect exchange from ticker suffix and inject context for agents
if ticker.endswith(".JK"):
    os.environ["EXCHANGE_CONTEXT"] = """IMPORTANT CONTEXT: You are analyzing an Indonesian stock listed on the Indonesia Stock Exchange (IDX/BEI).
- Currency is Indonesian Rupiah (IDR/Rp), NOT USD
- Stock prices are in IDR (typically thousands to tens of thousands)
- Market hours: 09:00-16:00 WIB (UTC+7)
- Key indices: IDX Composite (IHSG), LQ45, IDX80
- Regulatory body: OJK (Otoritas Jasa Keuangan)
- Settlement: T+2
- Common sectors: Banking (BBCA, BBRI, BMRI), Telco (TLKM), Mining (ADRO, PTBA), Consumer (UNVR, ICBP)
- Dividend yield tends to be higher than US stocks (3-8% common)
- Consider USD/IDR exchange rate impact on export/import companies
- Consider Bank Indonesia interest rate decisions
- Consider commodity prices impact (palm oil, coal, nickel) for relevant sectors
- Financial reports follow PSAK (Indonesian GAAP), similar to IFRS
- Analyst reports often in Bahasa Indonesia — key terms: "beli" = buy, "jual" = sell, "tahan" = hold"""
elif ticker.endswith(".T"):
    os.environ["EXCHANGE_CONTEXT"] = "You are analyzing a Japanese stock on the Tokyo Stock Exchange (TSE). Currency is JPY."
elif ticker.endswith(".HK"):
    os.environ["EXCHANGE_CONTEXT"] = "You are analyzing a Hong Kong stock on the HKEX. Currency is HKD."
elif ticker.endswith(".TO"):
    os.environ["EXCHANGE_CONTEXT"] = "You are analyzing a Canadian stock on the TSX. Currency is CAD."

# Date context — always injected
from datetime import datetime
_today = datetime.now().strftime("%Y-%m-%d")
os.environ["DATE_CONTEXT"] = (
    f"IMPORTANT: Today's date is {_today}. The analysis date is {date}. "
    f"Always reference these dates explicitly in your analysis. "
    f"Do not ask what the current date is — it is {_today}."
)

# Analyst persona — always injected
os.environ["ANALYST_PERSONA"] = (
    "You are an expert financial analyst. You have all the information you need. "
    "NEVER ask clarifying questions. NEVER say 'I need more information'. "
    "NEVER ask 'what would you like to know?'. "
    "Always provide a complete, decisive analysis based on available data. "
    "If data is limited, make reasonable assumptions and state them explicitly. "
    "Always conclude with a clear BUY / OVERWEIGHT / HOLD / UNDERWEIGHT / SELL recommendation."
)

# Language instruction — always injected
os.environ["LANGUAGE_INSTRUCTION"] = "Always respond in English only. Do not use any other language."

print("[STATUS] Initializing agents for " + ticker + " on " + date, flush=True)
stats = StatsCallbackHandler()
global_start = time.time()
ta = TradingAgentsGraph(debug=False, config=config, callbacks=[stats])
print("[STATUS] Starting analysis...", flush=True)

init_state  = ta.propagator.create_initial_state(ticker, date)
stream_args = ta.propagator.get_graph_args()

printed = set()
track = {**stats.snapshot(), "time": time.time()}

def maybe_emit(marker, content):
    if marker in printed:
        return
    if not content:
        return
    text = str(content).strip()
    if not text:
        return
    printed.add(marker)
    cur = stats.snapshot()
    now = time.time()
    d_in  = cur["tokens_in"]  - track["tokens_in"]
    d_out = cur["tokens_out"] - track["tokens_out"]
    print("[TOKEN_USAGE] " + json.dumps({
        "agent": marker,
        "input": d_in,
        "output": d_out,
        "total": d_in + d_out,
        "elapsed_ms": int((now - track["time"]) * 1000)
    }), flush=True)
    track.update({**cur, "time": now})
    print("[" + marker + "]", flush=True)
    for line in text.split("\\n"):
        print(line, flush=True)

for chunk in ta.graph.stream(init_state, **stream_args):
    maybe_emit("MARKET_ANALYST",       chunk.get("market_report"))
    maybe_emit("FUNDAMENTALS_ANALYST", chunk.get("fundamentals_report"))
    maybe_emit("SENTIMENT_ANALYST",    chunk.get("sentiment_report"))
    maybe_emit("NEWS_ANALYST",         chunk.get("news_report"))

    invest = chunk.get("investment_debate_state") or {}
    maybe_emit("BULL_RESEARCHER",   invest.get("bull_history"))
    maybe_emit("BEAR_RESEARCHER",   invest.get("bear_history"))
    maybe_emit("RESEARCH_DECISION", chunk.get("investment_plan"))
    maybe_emit("TRADER_DECISION",   chunk.get("trader_investment_plan"))

    risk = chunk.get("risk_debate_state") or {}
    maybe_emit("RISK_AGGRESSIVE",   risk.get("aggressive_history"))
    maybe_emit("RISK_NEUTRAL",      risk.get("neutral_history"))
    maybe_emit("RISK_CONSERVATIVE", risk.get("conservative_history"))
    maybe_emit("FINAL_DECISION",    chunk.get("final_trade_decision"))

final = stats.snapshot()
print("[TOKEN_TOTAL] " + json.dumps({
    "input": final["tokens_in"],
    "output": final["tokens_out"],
    "total": final["tokens_in"] + final["tokens_out"],
    "elapsed_ms": int((time.time() - global_start) * 1000)
}), flush=True)
print("[COMPLETE]", flush=True)
`

  const proc = spawn(pythonPath, ["-c", script, ticker, date, projectRoot, model, debateRounds.toString(), userId, process.env.INTERNAL_SECRET || ""], {
    cwd: projectRoot,
    env: { ...process.env, PYTHONPATH: projectRoot },
  })

  // Update pid in Prisma (fire-and-forget)
  prisma.job.update({ where: { id: jobId }, data: { status: "running", pid: proc.pid } }).catch(() => {})

  const MARKERS = [
    "MARKET_ANALYST", "FUNDAMENTALS_ANALYST", "SENTIMENT_ANALYST", "NEWS_ANALYST",
    "BULL_RESEARCHER", "BEAR_RESEARCHER", "RESEARCH_DECISION", "TRADER_DECISION",
    "RISK_AGGRESSIVE", "RISK_NEUTRAL", "RISK_CONSERVATIVE", "FINAL_DECISION",
    "STATUS", "COMPLETE", "ERROR", "TOKEN_USAGE", "TOKEN_TOTAL",
  ]

  // Local job state for this streaming session — NOT a global Map.
  // Lives only in this closure for the duration of this request.
  const jobSections = emptySections()
  const jobLogs: string[] = []
  const jobTokenUsage = emptyTokenUsage()
  let jobStatus: "pending" | "running" | "complete" | "error" | "cancelled" = "running"

  function persistState(extra?: Record<string, unknown>) {
    prisma.job.update({
      where: { id: jobId },
      data: {
        status: jobStatus,
        sections: JSON.stringify(jobSections),
        logs: JSON.stringify(jobLogs),
        tokenUsage: JSON.stringify(jobTokenUsage),
        ...extra,
      },
    }).catch(() => {})
  }

  let currentSection = ""
  let buffer = ""

  proc.stdout.on("data", (chunk: Buffer) => {
    const lines = (buffer + chunk.toString()).split("\n")
    buffer = lines.pop() || ""
    for (const line of lines) {
      const found = MARKERS.find(m => line.includes("[" + m + "]"))
      if (found) {
        if (found === "COMPLETE") {
          jobStatus = "complete"
          const verdict = detectVerdict(jobSections.final_decision)
          jobLogs.push("[COMPLETE] Done")
          persistState({ verdict: verdict ?? null })
        } else if (found === "ERROR") {
          const msg = line.replace(/\[ERROR\]/g, "").trim()
          jobStatus = "error"
          jobLogs.push("[ERROR] " + msg)
          persistState({ error: msg })
        } else if (found === "STATUS") {
          const msg = line.split("[STATUS]")[1]?.trim()
          if (msg) {
            jobLogs.push("[STATUS] " + msg)
            persistState()
          }
        } else if (found === "TOKEN_USAGE") {
          const jsonStr = line.split("[TOKEN_USAGE]")[1]?.trim()
          if (jsonStr) {
            try {
              const u = JSON.parse(jsonStr) as { agent: string; input: number; output: number; total: number; elapsed_ms: number }
              jobTokenUsage.input += u.input
              jobTokenUsage.output += u.output
              jobTokenUsage.total += u.total
              jobTokenUsage.byAgent[u.agent] = { input: u.input, output: u.output, total: u.total, elapsed_ms: u.elapsed_ms }
              persistState()
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            } catch (_) {}
          }
        } else if (found === "TOKEN_TOTAL") {
          const jsonStr = line.split("[TOKEN_TOTAL]")[1]?.trim()
          if (jsonStr) {
            try {
              const t = JSON.parse(jsonStr) as { input: number; output: number; total: number; elapsed_ms: number }
              Object.assign(jobTokenUsage, t)
              persistState()
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            } catch (_) {}
          }
        } else {
          // Section marker
          currentSection = found
          jobLogs.push("[SECTION] " + found)
          persistState()
        }
      } else if (currentSection && line.trim()) {
        const safeData = line
          .replace(/\/home\/[^\s]+/g, "[path]")
          .replace(/sk-[a-zA-Z0-9]+/g, "[key]")
          .slice(0, 4000)
        const key = currentSection.toLowerCase() as keyof Sections
        if (key in jobSections) {
          jobSections[key].push(safeData)
          persistState()
        }
      }
    }
  })

  proc.stderr.on("data", (chunk: Buffer) => {
    const msg = chunk.toString()
    if (msg.toLowerCase().includes("error") || msg.toLowerCase().includes("traceback")) {
      if (jobStatus === "running") {
        jobLogs.push("[ERROR] " + msg.split("\n")[0].slice(0, 300))
        persistState()
      }
    }
  })

  proc.on("close", (code: number) => {
    if (jobStatus === "running") {
      jobStatus = "error"
      const errMsg = code !== 0 ? `Process exited with code ${code}` : "Process ended unexpectedly"
      persistState({ error: errMsg })
    }
  })

  return Response.json({ jobId })
}
