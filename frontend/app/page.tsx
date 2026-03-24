"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import AgentPanel from "@/components/AgentPanel"
import VerdictCard from "@/components/VerdictCard"

type Sections = {
  market_analyst: string[]
  fundamentals_analyst: string[]
  sentiment_analyst: string[]
  news_analyst: string[]
  bull_researcher: string[]
  bear_researcher: string[]
  research_decision: string[]
  trader_decision: string[]
  risk_aggressive: string[]
  risk_neutral: string[]
  risk_conservative: string[]
  final_decision: string[]
}

type AgentTokens = { input: number; output: number; total: number; elapsed_ms: number }
type TokenUsage = {
  input: number
  output: number
  total: number
  elapsed_ms: number
  byAgent: Record<string, AgentTokens>
}
type SessionRun = {
  ticker: string
  date: string
  model: string
  tokens: TokenUsage
  cost: number
  verdict: string
  timestamp: string
  elapsedSeconds: number
}
type ORModel = { id: string; name: string; pricing?: { prompt: string; completion: string } }

const empty: Sections = {
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

const emptyTokenUsage: TokenUsage = { input: 0, output: 0, total: 0, elapsed_ms: 0, byAgent: {} }

const ROUND_FALLBACK: Record<number, [number, number]> = {
  1: [20000, 8000], 2: [35000, 14000], 3: [50000, 20000], 4: [65000, 26000], 5: [80000, 32000],
}
function minsPerRound(modelId: string): number {
  if (modelId.includes("flash-lite")) return 2
  if (modelId.includes("flash") || modelId.includes("haiku") || modelId.includes("mini")) return 3
  if (modelId.includes("pro") || modelId.includes("sonnet") || modelId.includes("opus")) return 6
  return 4
}

function fmtTime(s: number) {
  const m = Math.floor(s / 60), sec = s % 60
  return String(m).padStart(2, "0") + ":" + String(sec).padStart(2, "0")
}

function fmtNum(n: number) { return n.toLocaleString() }

function detectVerdict(lines: string[]): string {
  const text = lines.join(" ").toUpperCase()
  if (text.includes("STRONG BUY")) return "STRONG BUY"
  if (text.includes("STRONG SELL")) return "STRONG SELL"
  if (text.includes("OVERWEIGHT")) return "OVERWEIGHT"
  if (text.includes("UNDERWEIGHT")) return "UNDERWEIGHT"
  if (text.includes("BUY")) return "BUY"
  if (text.includes("SELL")) return "SELL"
  if (text.includes("HOLD")) return "HOLD"
  return "—"
}

function verdictEmoji(v: string): string {
  if (v === "BUY" || v === "STRONG BUY" || v === "OVERWEIGHT") return "🟢"
  if (v === "SELL" || v === "STRONG SELL" || v === "UNDERWEIGHT") return "🔴"
  if (v === "HOLD") return "🟡"
  return "⚪"
}

export default function Home() {
  const [ticker, setTicker] = useState("NVDA")
  const [date, setDate] = useState(new Date().toISOString().split("T")[0])
  const [running, setRunning] = useState(false)
  const [status, setStatus] = useState("")
  const [active, setActive] = useState("")
  const [sections, setSections] = useState<Sections>(empty)
  const [model, setModel] = useState("google/gemini-2.5-flash-lite")
  const [debateRounds, setDebateRounds] = useState(1)
  const [logs, setLogs] = useState<string[]>([])
  const [models, setModels] = useState<ORModel[]>([])
  const [loadingModels, setLoadingModels] = useState(true)
  const [modelSearch, setModelSearch] = useState("")
  const logBottomRef = useRef<HTMLDivElement>(null)

  // Job queue state
  const [jobId, setJobId] = useState<string | null>(null)
  const [resumeInput, setResumeInput] = useState("")
  const [showResume, setShowResume] = useState(false)
  const [copied, setCopied] = useState(false)
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fallbackCopy = (text: string) => {
    const el = document.createElement("textarea")
    el.value = text
    el.style.position = "fixed"
    el.style.top = "0"
    el.style.left = "0"
    el.style.opacity = "0"
    document.body.appendChild(el)
    el.focus()
    el.select()
    try {
      document.execCommand("copy")
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
    document.body.removeChild(el)
  }

  const handleCopy = (text: string) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
        }).catch(() => fallbackCopy(text))
      } else {
        fallbackCopy(text)
      }
    } catch {
      fallbackCopy(text)
    }
  }

  // Token tracking state
  const [tokenUsage, setTokenUsage] = useState<TokenUsage>(emptyTokenUsage)
  const [sessionHistory, setSessionHistory] = useState<SessionRun[]>([])
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [showTokenBreakdown, setShowTokenBreakdown] = useState(false)
  const [showSessionHistory, setShowSessionHistory] = useState(false)
  const [modelPricing, setModelPricing] = useState<{ prompt: number; completion: number } | null>(null)
  const pricingMapRef = useRef<Map<string, { prompt: number; completion: number }>>(new Map())
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [expandedHistoryRow, setExpandedHistoryRow] = useState<number | null>(null)
  const analysisStartTimeRef = useRef(0)
  const modelPricingRef = useRef<{ prompt: number; completion: number } | null>(null)

  useEffect(() => {
    fetch("https://openrouter.ai/api/v1/models")
      .then(r => r.json())
      .then(data => {
        const list = data.data as ORModel[]
        const sorted = list.sort((a, b) => a.id.localeCompare(b.id))
        setModels(sorted)
        setLoadingModels(false)
        const map = new Map<string, { prompt: number; completion: number }>()
        for (const m of list) {
          if (m.pricing) {
            map.set(m.id, {
              prompt: parseFloat(m.pricing.prompt) || 0,
              completion: parseFloat(m.pricing.completion) || 0,
            })
          }
        }
        pricingMapRef.current = map
        const p = map.get("google/gemini-2.5-flash-lite") ?? null
        setModelPricing(p)
        modelPricingRef.current = p
      })
      .catch(() => setLoadingModels(false))
  }, [])

  useEffect(() => {
    logBottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [logs])

  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission()
    }
  }, [])

  // Timer: count up while running
  useEffect(() => {
    if (running) {
      timerRef.current = setInterval(() => {
        setElapsedSeconds(Math.floor((Date.now() - analysisStartTimeRef.current) / 1000))
      }, 1000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [running])

  const filteredModels = models.filter(m =>
    m.id.toLowerCase().includes(modelSearch.toLowerCase()) ||
    m.name.toLowerCase().includes(modelSearch.toLowerCase())
  )

  const pollJob = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/jobs/status?id=${encodeURIComponent(id)}`, {
        headers: { "x-api-key": process.env.NEXT_PUBLIC_DASHBOARD_SECRET || "" },
      })
      if (!res.ok) return
      const job = await res.json()

      setSections(job.sections)
      setLogs(job.logs)
      setTokenUsage(job.tokenUsage)

      // Detect active section from last SECTION log entry
      const lastSectionLog = [...(job.logs as string[])].reverse().find((l: string) => l.startsWith("[SECTION]"))
      if (lastSectionLog && job.status === "running") {
        setActive(lastSectionLog.replace("[SECTION] ", "").toLowerCase())
      }

      // Update status text from last log
      const lastLog = (job.logs as string[]).at(-1) ?? ""
      if (lastLog.startsWith("[STATUS]")) {
        setStatus(lastLog.replace("[STATUS] ", ""))
      } else if (lastLog.startsWith("[SECTION]")) {
        setStatus("Running: " + lastLog.replace("[SECTION] ", "").replace(/_/g, " "))
      }

      if (job.status === "complete") {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
        setRunning(false)
        setActive("")
        setStatus("Analysis complete")
        const pricing = modelPricingRef.current
        const cost = pricing
          ? job.tokenUsage.input * pricing.prompt + job.tokenUsage.output * pricing.completion
          : 0
        const run: SessionRun = {
          ticker: job.ticker,
          date: job.date,
          model: job.model,
          tokens: job.tokenUsage,
          cost,
          verdict: job.verdict || detectVerdict(job.sections.final_decision),
          timestamp: new Date().toLocaleTimeString(),
          elapsedSeconds: Math.floor((Date.now() - analysisStartTimeRef.current) / 1000),
        }
        setSessionHistory(prev => [run, ...prev].slice(0, 5))
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification("AI Trading War Room", {
            body: `${job.ticker} analysis complete — ${job.verdict ?? "Result ready"}`,
            icon: "/favicon.ico",
            tag: job.id,
          })
        }
      } else if (job.status === "error") {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
        setRunning(false)
        setStatus("Error: " + (job.error || "Unknown error"))
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification("AI Trading War Room", {
            body: `${job.ticker} analysis failed: ${job.error ?? "Unknown error"}`,
            tag: job.id,
          })
        }
      } else if (job.status === "cancelled") {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
        setRunning(false)
        setStatus("Cancelled")
      }
    } catch (_) {}
  }, [])

  const handleCancel = async () => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
    if (jobId) {
      try {
        await fetch(`/api/jobs/cancel?id=${encodeURIComponent(jobId)}`, {
          method: "DELETE",
          headers: { "x-api-key": process.env.NEXT_PUBLIC_DASHBOARD_SECRET || "" },
        })
      } catch (_) {}
    }
    setRunning(false)
    setActive("")
    setStatus("Cancelled")
    setJobId(null)
  }

  const handleRun = async () => {
    if (running) return
    const startTime = Date.now()
    analysisStartTimeRef.current = startTime
    setSections(empty)
    setLogs([])
    setStatus("Starting job...")
    setRunning(true)
    setActive("")
    setTokenUsage(emptyTokenUsage)
    setElapsedSeconds(0)
    setJobId(null)

    try {
      const res = await fetch("/api/jobs/start", {
        method: "POST",
        headers: {
          "x-api-key": process.env.NEXT_PUBLIC_DASHBOARD_SECRET || "",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ticker, date, model, debate_rounds: debateRounds.toString() }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Request failed" }))
        setStatus(err.error || "Failed to start job")
        setRunning(false)
        return
      }

      const { jobId: newJobId } = await res.json()
      setJobId(newJobId)
      pollIntervalRef.current = setInterval(() => pollJob(newJobId), 2000)
    } catch (_) {
      setStatus("Connection failed")
      setRunning(false)
    }
  }

  const handleResume = async (id: string) => {
    if (!id.trim()) return
    try {
      const res = await fetch(`/api/jobs/status?id=${encodeURIComponent(id.trim())}`, {
        headers: { "x-api-key": process.env.NEXT_PUBLIC_DASHBOARD_SECRET || "" },
      })
      if (!res.ok) { setStatus("Job not found"); return }
      const job = await res.json()

      setJobId(id.trim())
      setSections(job.sections)
      setLogs(job.logs)
      setTokenUsage(job.tokenUsage)
      setStatus(job.status === "complete" ? "Analysis complete" : job.status === "error" ? "Error: " + job.error : job.status)

      if (job.status === "running") {
        setRunning(true)
        analysisStartTimeRef.current = job.createdAt
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = setInterval(() => pollJob(id.trim()), 2000)
      }

      setShowResume(false)
      setResumeInput("")
    } catch (_) {
      setStatus("Failed to resume job")
    }
  }

  const handleExport = () => {
    const modelShort = model.split("/").pop()?.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 20) ?? "model"
    const filename = `${ticker}_${date}_${modelShort}.json`
    const pricing = modelPricingRef.current
    const data = {
      ticker,
      date,
      model,
      jobId,
      timestamp: new Date().toISOString(),
      verdict: detectVerdict(sections.final_decision),
      verdictText: sections.final_decision.join("\n"),
      tokenUsage: {
        input: tokenUsage.input,
        output: tokenUsage.output,
        total: tokenUsage.total,
        byAgent: tokenUsage.byAgent,
      },
      cost: pricing
        ? (tokenUsage.input * pricing.prompt) + (tokenUsage.output * pricing.completion)
        : null,
      elapsedSeconds,
      reports: {
        market_analyst: sections.market_analyst.join("\n"),
        fundamentals_analyst: sections.fundamentals_analyst.join("\n"),
        sentiment_analyst: sections.sentiment_analyst.join("\n"),
        news_analyst: sections.news_analyst.join("\n"),
        bull_researcher: sections.bull_researcher.join("\n"),
        bear_researcher: sections.bear_researcher.join("\n"),
        research_decision: sections.research_decision.join("\n"),
        trader_decision: sections.trader_decision.join("\n"),
        risk_aggressive: sections.risk_aggressive.join("\n"),
        risk_neutral: sections.risk_neutral.join("\n"),
        risk_conservative: sections.risk_conservative.join("\n"),
        final_decision: sections.final_decision.join("\n"),
      },
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  // Cost calculation
  const cost = modelPricing
    ? (tokenUsage.input * modelPricing.prompt) + (tokenUsage.output * modelPricing.completion)
    : null
  const costStr = cost != null && cost > 0 ? "~$" + cost.toFixed(4) : ""

  // Token breakdown helpers
  const agentEntries = Object.entries(tokenUsage.byAgent)
  const maxAgent = agentEntries.length > 0
    ? agentEntries.reduce((a, b) => b[1].total > a[1].total ? b : a)[0]
    : ""

  const hasAnyAnalyst =
    sections.market_analyst.length > 0 ||
    sections.fundamentals_analyst.length > 0 ||
    sections.sentiment_analyst.length > 0 ||
    sections.news_analyst.length > 0 ||
    active === "market_analyst" || active === "fundamentals_analyst" ||
    active === "sentiment_analyst" || active === "news_analyst"

  const hasAnyDebate =
    sections.bull_researcher.length > 0 ||
    sections.bear_researcher.length > 0 ||
    sections.research_decision.length > 0 ||
    active === "bull_researcher" || active === "bear_researcher" || active === "research_decision"

  const hasTrader =
    sections.trader_decision.length > 0 || active === "trader_decision"

  const hasAnyRisk =
    sections.risk_aggressive.length > 0 ||
    sections.risk_neutral.length > 0 ||
    sections.risk_conservative.length > 0 ||
    active === "risk_aggressive" || active === "risk_neutral" || active === "risk_conservative"

  // Cost/time estimator
  const modelRuns = sessionHistory.filter(r => r.model === model).slice(0, 3)
  const [fallbackIn, fallbackOut] = ROUND_FALLBACK[debateRounds] ?? ROUND_FALLBACK[3]
  const estIn  = modelRuns.length > 0 ? Math.round(modelRuns.reduce((s, r) => s + r.tokens.input,  0) / modelRuns.length) : fallbackIn
  const estOut = modelRuns.length > 0 ? Math.round(modelRuns.reduce((s, r) => s + r.tokens.output, 0) / modelRuns.length) : fallbackOut
  const estCost = modelPricing ? estIn * modelPricing.prompt + estOut * modelPricing.completion : null
  const estMins = minsPerRound(model) * debateRounds
  const estSource = modelRuns.length > 0 ? `based on ${modelRuns.length} previous run${modelRuns.length > 1 ? "s" : ""} with this model` : "based on fallback estimates"

  return (
    <div className="dot-grid min-h-screen">
      {/* Header */}
      <div className="bg-gradient-to-b from-slate-900 to-slate-950 border-b border-zinc-800 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-black tracking-widest text-zinc-100">AI TRADING WAR ROOM</h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              Multi-agent analysis &middot; <span className="text-yellow-500 font-mono">{model}</span>
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap justify-end">
            {/* Token / Timer HUD */}
            {(running || tokenUsage.total > 0) && (
              <div className="flex items-center gap-2 font-mono text-xs">
                <span className="text-zinc-400">⏱ {fmtTime(elapsedSeconds)}</span>
                <span className="text-zinc-700">|</span>
                <span style={{ color: "#60a5fa" }}>IN: {fmtNum(tokenUsage.input)}</span>
                <span style={{ color: "#22c55e" }}>OUT: {fmtNum(tokenUsage.output)}</span>
                <span className="text-zinc-100">TOT: {fmtNum(tokenUsage.total)}</span>
                {costStr && <span style={{ color: "#fbbf24" }}>{costStr}</span>}
                {tokenUsage.total > 100000 && (
                  <span className="animate-pulse" style={{ color: "#ef4444" }}>⚠</span>
                )}
                {tokenUsage.total > 50000 && tokenUsage.total <= 100000 && (
                  <span style={{ color: "#fbbf24" }}>⚠</span>
                )}
              </div>
            )}
            {running && <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />}
            <span className="text-xs text-zinc-400 font-mono max-w-xs truncate">{status}</span>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-4">
        {/* Controls */}
        <div className="glass-panel rounded-lg p-4 flex flex-wrap gap-4 items-end">
          <div>
            <label className="text-xs text-zinc-500 uppercase tracking-wider block mb-1">Ticker</label>
            <input
              value={ticker}
              onChange={e => setTicker(e.target.value.toUpperCase())}
              maxLength={12}
              placeholder="NVDA, BBCA.JK"
              className="bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm font-mono text-zinc-100 w-36 focus:outline-none focus:border-zinc-500"
            />
            <p className="text-xs text-zinc-600 mt-1">US: NVDA &middot; ID: BBCA.JK &middot; JP: 7203.T &middot; HK: 0700.HK</p>
          </div>

          <div>
            <label className="text-xs text-zinc-500 uppercase tracking-wider block mb-1">Date</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm font-mono text-zinc-100 focus:outline-none focus:border-zinc-500"
            />
          </div>

          <div>
            <label className="text-xs text-zinc-500 uppercase tracking-wider block mb-1">Debate Rounds</label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  onClick={() => setDebateRounds(n)}
                  disabled={running}
                  className="w-8 h-8 rounded font-bold text-sm font-mono transition-colors"
                  style={{
                    background: debateRounds === n ? "#22c55e15" : "#18181b",
                    border: "1px solid " + (debateRounds === n ? "#22c55e50" : "#3f3f46"),
                    color: debateRounds === n ? "#22c55e" : "#71717a",
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="text-xs text-zinc-600 mt-1">More rounds = deeper analysis, higher cost</p>
          </div>

          <div className="flex-1 min-w-[260px]">
            <label className="text-xs text-zinc-500 uppercase tracking-wider block mb-1">
              Model {loadingModels ? "(loading...)" : "(" + models.length + " available)"}
            </label>
            <input
              value={modelSearch}
              onChange={e => setModelSearch(e.target.value)}
              placeholder="Search model..."
              className="bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm font-mono text-zinc-100 w-full focus:outline-none focus:border-zinc-500 mb-1"
            />
            <select
              value={model}
              onChange={e => {
                setModel(e.target.value)
                setModelSearch("")
                const p = pricingMapRef.current.get(e.target.value) ?? null
                setModelPricing(p)
                modelPricingRef.current = p
              }}
              className="bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm font-mono text-zinc-100 w-full focus:outline-none focus:border-zinc-500"
            >
              {filteredModels.length > 0 ? (
                filteredModels.map(m => {
                  const pIn  = m.pricing ? parseFloat(m.pricing.prompt)     : 0
                  const pOut = m.pricing ? parseFloat(m.pricing.completion) : 0
                  const isFree = pIn === 0 && pOut === 0
                  const priceStr = isFree
                    ? " · FREE"
                    : ` · $${(pIn * 1_000_000).toFixed(4)}/M in · $${(pOut * 1_000_000).toFixed(4)}/M out`
                  return <option key={m.id} value={m.id}>{m.name} ({m.id}){priceStr}</option>
                })
              ) : (
                <option value={model}>{model}</option>
              )}
            </select>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleRun}
              disabled={running}
              className="px-6 py-2 rounded font-bold text-sm tracking-wider transition-colors"
              style={{
                background: running ? "#27272a" : "#22c55e15",
                border: "1px solid " + (running ? "#3f3f46" : "#22c55e50"),
                color: running ? "#71717a" : "#22c55e",
              }}
            >
              {running ? "RUNNING..." : "RUN ANALYSIS"}
            </button>
            {running && (
              <button
                onClick={handleCancel}
                className="px-4 py-2 rounded font-bold text-sm tracking-wider transition-colors"
                style={{ background: "#ef444415", border: "1px solid #ef444450", color: "#ef4444" }}
              >
                CANCEL
              </button>
            )}
          </div>
        </div>

        {/* Estimator */}
        {!running && (
          <div className="mt-2 glass-panel rounded-lg px-4 py-2 text-xs font-mono text-zinc-500 italic">
            ESTIMATED: ~{estMins} min{estCost != null && estCost > 0 ? ` · ~$${estCost.toFixed(4)}` : ""} ({estSource})
          </div>
        )}

        {/* Job ID display */}
        {jobId && (
          <div className="mt-2 glass-panel rounded-lg px-4 py-2 flex items-center gap-3 flex-wrap">
            <span className="text-xs font-mono text-zinc-500 uppercase tracking-wider">Job</span>
            <span
              className="text-xs font-mono text-zinc-300"
              style={{ userSelect: "all", cursor: "text" }}
            >
              {jobId}
            </span>
            <button
              onClick={() => handleCopy(jobId)}
              className="text-xs font-mono px-2 py-0.5 rounded transition-colors"
              style={{ background: "#27272a", border: "1px solid #3f3f46", color: copied ? "#22c55e" : "#a1a1aa" }}
            >
              {copied ? "COPIED" : "COPY"}
            </button>
            {running && (
              <span className="flex items-center gap-1.5 text-xs font-mono text-zinc-500">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" />
                Polling every 2s
              </span>
            )}
          </div>
        )}

        {/* Resume panel */}
        <div className="mt-2">
          <button
            onClick={() => setShowResume(b => !b)}
            className="text-xs font-mono text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            {showResume ? "▲" : "▼"} RESUME JOB BY ID
          </button>
          {showResume && (
            <div className="mt-2 glass-panel rounded-lg px-4 py-3 flex gap-2 items-center flex-wrap">
              <input
                value={resumeInput}
                onChange={e => setResumeInput(e.target.value)}
                placeholder="Enter Job ID to resume..."
                className="bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-xs font-mono text-zinc-100 flex-1 min-w-[260px] focus:outline-none focus:border-zinc-500"
              />
              <button
                onClick={() => handleResume(resumeInput)}
                disabled={!resumeInput.trim()}
                className="px-4 py-1.5 rounded font-bold text-xs tracking-wider transition-colors"
                style={{
                  background: resumeInput.trim() ? "#3b82f615" : "#27272a",
                  border: "1px solid " + (resumeInput.trim() ? "#3b82f650" : "#3f3f46"),
                  color: resumeInput.trim() ? "#60a5fa" : "#71717a",
                }}
              >
                RESUME
              </button>
            </div>
          )}
        </div>

        {/* Live Log */}
        {logs.length > 0 && (
          <div className="mt-4 glass-panel rounded-lg p-4">
            <p className="text-xs text-zinc-500 uppercase tracking-widest mb-2">Live Log</p>
            <div className="text-xs font-mono space-y-0.5 max-h-36 overflow-y-auto scrollbar-thin">
              {logs.map((log, i) => (
                <p
                  key={i}
                  className={
                    log.startsWith("[ERROR]")    ? "text-red-400"    :
                    log.startsWith("[COMPLETE]") ? "text-green-400"  :
                    log.startsWith("[SECTION]")  ? "text-yellow-400" :
                    log.startsWith("[STATUS]")   ? "text-zinc-400"   :
                    "text-zinc-600"
                  }
                >
                  {log}
                </p>
              ))}
              <div ref={logBottomRef} />
            </div>
          </div>
        )}

        {/* Token Breakdown Panel */}
        {tokenUsage.total > 0 && (
          <div className="mt-4 glass-panel rounded-lg overflow-hidden">
            <button
              onClick={() => setShowTokenBreakdown(b => !b)}
              className="w-full px-4 py-2.5 text-left flex justify-between items-center hover:bg-zinc-800/30 transition-colors"
            >
              <span className="text-xs text-zinc-500 uppercase tracking-widest font-mono">
                TOKEN USAGE
              </span>
              <span className="text-xs text-zinc-600">{showTokenBreakdown ? "▲" : "▼"}</span>
            </button>
            {showTokenBreakdown && (
              <div className="px-4 pb-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs font-mono">
                    <thead>
                      <tr className="text-zinc-600 border-b border-zinc-800">
                        <th className="text-left py-1.5 pr-4 font-normal">Agent</th>
                        <th className="text-right py-1.5 px-2 font-normal" style={{ color: "#60a5fa" }}>Input</th>
                        <th className="text-right py-1.5 px-2 font-normal" style={{ color: "#22c55e" }}>Output</th>
                        <th className="text-right py-1.5 px-2 font-normal text-zinc-400">Total</th>
                        <th className="text-right py-1.5 px-2 font-normal text-zinc-500">Time</th>
                        <th className="text-right py-1.5 px-2 font-normal text-zinc-500">Speed</th>
                        <th className="text-right py-1.5 pl-2 font-normal text-zinc-600">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {agentEntries.map(([agent, u]) => {
                        const pct = tokenUsage.total > 0 ? (u.total / tokenUsage.total) * 100 : 0
                        const secs = u.elapsed_ms / 1000
                        const speed = secs > 0 ? Math.round(u.total / secs) : 0
                        const isMax = agent === maxAgent
                        const color = isMax ? "#fb923c" : "#a1a1aa"
                        return (
                          <tr key={agent} className="border-b border-zinc-800/50">
                            <td className="py-1.5 pr-4" style={{ color }}>
                              {agent.replace(/_/g, " ")}
                              <div className="mt-0.5 h-0.5 rounded-full" style={{ width: pct.toFixed(1) + "%", background: isMax ? "#fb923c40" : "#60a5fa20" }} />
                            </td>
                            <td className="text-right px-2 py-1.5" style={{ color: "#60a5fa90" }}>{fmtNum(u.input)}</td>
                            <td className="text-right px-2 py-1.5" style={{ color: "#22c55e90" }}>{fmtNum(u.output)}</td>
                            <td className="text-right px-2 py-1.5" style={{ color }}>{fmtNum(u.total)}</td>
                            <td className="text-right px-2 py-1.5 text-zinc-500">{secs.toFixed(1)}s</td>
                            <td className="text-right px-2 py-1.5 text-zinc-500">{fmtNum(speed)} t/s</td>
                            <td className="text-right pl-2 py-1.5 text-zinc-600">{pct.toFixed(1)}%</td>
                          </tr>
                        )
                      })}
                      {/* Total row */}
                      <tr className="text-zinc-300 border-t border-zinc-700 font-medium">
                        <td className="py-1.5 pr-4 text-zinc-400">TOTAL</td>
                        <td className="text-right px-2 py-1.5" style={{ color: "#60a5fa" }}>{fmtNum(tokenUsage.input)}</td>
                        <td className="text-right px-2 py-1.5" style={{ color: "#22c55e" }}>{fmtNum(tokenUsage.output)}</td>
                        <td className="text-right px-2 py-1.5 text-zinc-100">{fmtNum(tokenUsage.total)}</td>
                        <td className="text-right px-2 py-1.5 text-zinc-400">{fmtTime(Math.round(tokenUsage.elapsed_ms / 1000))}</td>
                        <td className="text-right px-2 py-1.5 text-zinc-500">
                          {tokenUsage.elapsed_ms > 0 ? fmtNum(Math.round(tokenUsage.total / (tokenUsage.elapsed_ms / 1000))) + " t/s" : "—"}
                        </td>
                        <td className="text-right pl-2 py-1.5 text-zinc-500">100%</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Session History Panel */}
        {sessionHistory.length > 0 && (
          <div className="mt-4 glass-panel rounded-lg overflow-hidden">
            <button
              onClick={() => setShowSessionHistory(b => !b)}
              className="w-full px-4 py-2.5 text-left flex justify-between items-center hover:bg-zinc-800/30 transition-colors"
            >
              <span className="text-xs text-zinc-500 uppercase tracking-widest font-mono">
                Session History ({sessionHistory.length})
              </span>
              <span className="text-xs text-zinc-600">{showSessionHistory ? "▲" : "▼"}</span>
            </button>
            {showSessionHistory && (
              <div className="px-4 pb-3 space-y-1">
                {sessionHistory.map((run, i) => {
                  const modelShort = run.model.split("/").pop() ?? run.model
                  const isExpanded = expandedHistoryRow === i
                  return (
                    <div key={i}>
                      <button
                        onClick={() => setExpandedHistoryRow(isExpanded ? null : i)}
                        className="w-full text-left px-3 py-2 rounded font-mono text-xs flex flex-wrap gap-x-2 gap-y-0.5 hover:bg-zinc-800/40 transition-colors"
                      >
                        <span className="text-zinc-200 font-bold">{run.ticker}</span>
                        <span className="text-zinc-600">•</span>
                        <span className="text-zinc-500">{modelShort}</span>
                        <span className="text-zinc-600">•</span>
                        <span className="text-zinc-400">{fmtNum(run.tokens.total)} tok</span>
                        {run.cost > 0 && (
                          <>
                            <span className="text-zinc-600">•</span>
                            <span style={{ color: "#fbbf24" }}>~${run.cost.toFixed(4)}</span>
                          </>
                        )}
                        <span className="text-zinc-600">•</span>
                        <span>{verdictEmoji(run.verdict)} <span className="text-zinc-300">{run.verdict}</span></span>
                        <span className="text-zinc-600">•</span>
                        <span className="text-zinc-500">{fmtTime(run.elapsedSeconds)}</span>
                        <span className="text-zinc-600">•</span>
                        <span className="text-zinc-600">{run.timestamp}</span>
                      </button>
                      {isExpanded && (
                        <div className="mx-3 mb-1 px-3 py-2 rounded bg-zinc-900/60 text-xs font-mono text-zinc-400 whitespace-pre-wrap max-h-32 overflow-y-auto">
                          {run.tokens.byAgent && Object.keys(run.tokens.byAgent).length > 0 ? (
                            Object.entries(run.tokens.byAgent).map(([agent, u]) => (
                              <div key={agent} className="flex gap-4">
                                <span className="text-zinc-600 w-36 truncate">{agent.replace(/_/g, " ")}</span>
                                <span style={{ color: "#60a5fa90" }}>in:{fmtNum(u.input)}</span>
                                <span style={{ color: "#22c55e90" }}>out:{fmtNum(u.output)}</span>
                                <span className="text-zinc-500">{(u.elapsed_ms / 1000).toFixed(1)}s</span>
                              </div>
                            ))
                          ) : (
                            <span className="text-zinc-600">No per-agent breakdown available</span>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Analyst Team */}
        {hasAnyAnalyst && (
          <div className="mt-6">
            <SectionLabel>Analyst Team</SectionLabel>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <AgentPanel
                title="Market Analyst"
                icon="📈"
                content={sections.market_analyst}
                accentColor="#38bdf8"
                isActive={active === "market_analyst"}
              />
              <AgentPanel
                title="Fundamentals Analyst"
                icon="📊"
                content={sections.fundamentals_analyst}
                accentColor="#60a5fa"
                isActive={active === "fundamentals_analyst"}
              />
              <AgentPanel
                title="Sentiment Analyst"
                icon="💬"
                content={sections.sentiment_analyst}
                accentColor="#a78bfa"
                isActive={active === "sentiment_analyst"}
              />
              <AgentPanel
                title="News Analyst"
                icon="📰"
                content={sections.news_analyst}
                accentColor="#fb923c"
                isActive={active === "news_analyst"}
              />
            </div>
          </div>
        )}

        {/* Researcher Debate */}
        {hasAnyDebate && (
          <div className="mt-6">
            <SectionLabel>Researcher Debate</SectionLabel>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <AgentPanel
                title="Bear Researcher"
                icon="📉"
                content={sections.bear_researcher}
                accentColor="#ef4444"
                glowClass="bear-glow"
                isActive={active === "bear_researcher"}
              />
              <AgentPanel
                title="Bull Researcher"
                icon="📈"
                content={sections.bull_researcher}
                accentColor="#22c55e"
                glowClass="bull-glow"
                isActive={active === "bull_researcher"}
              />
            </div>
            {(sections.research_decision.length > 0 || active === "research_decision") && (
              <AgentPanel
                title="Research Manager Decision"
                icon="🧠"
                content={sections.research_decision}
                accentColor="#c084fc"
                isActive={active === "research_decision"}
              />
            )}
          </div>
        )}

        {/* Trading Desk */}
        {hasTrader && (
          <div className="mt-6">
            <SectionLabel>Trading Desk</SectionLabel>
            <AgentPanel
              title="Trader Decision"
              icon="💼"
              content={sections.trader_decision}
              accentColor="#fbbf24"
              isActive={active === "trader_decision"}
            />
          </div>
        )}

        {/* Risk Management */}
        {hasAnyRisk && (
          <div className="mt-6">
            <SectionLabel>Risk Management</SectionLabel>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <AgentPanel
                title="Aggressive"
                icon="⚠️"
                content={sections.risk_aggressive}
                accentColor="#ef4444"
                isActive={active === "risk_aggressive"}
              />
              <AgentPanel
                title="Neutral"
                icon="⚖️"
                content={sections.risk_neutral}
                accentColor="#eab308"
                isActive={active === "risk_neutral"}
              />
              <AgentPanel
                title="Conservative"
                icon="🛡️"
                content={sections.risk_conservative}
                accentColor="#22c55e"
                isActive={active === "risk_conservative"}
              />
            </div>
          </div>
        )}

        {/* Final Verdict */}
        <VerdictCard decision={sections.final_decision} isActive={active === "final_decision"} />

        {/* Export Button */}
        {sections.final_decision.length > 0 && !running && (
          <div className="mt-4 flex justify-end">
            <button
              onClick={handleExport}
              className="px-4 py-2 rounded text-xs font-bold tracking-wider transition-colors"
              style={{ background: "#18181b", border: "1px solid #3f3f46", color: "#a1a1aa" }}
            >
              ⬇ EXPORT JSON
            </button>
          </div>
        )}

        <div className="h-12" />
      </div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs text-zinc-600 uppercase tracking-widest mb-3 flex items-center gap-2">
      <span className="inline-block w-4 h-px bg-zinc-700" />
      {children}
      <span className="flex-1 h-px bg-zinc-800" />
    </p>
  )
}
