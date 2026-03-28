"use client"
import ReactMarkdown from "react-markdown"

interface Props {
  decision: string[]
  isActive?: boolean
}

type Rating = {
  bg: string
  border: string
  color: string
  label: string
  emoji: string
}

const RATINGS: Record<string, Rating> = {
  SELL:         { bg: "rgba(239,68,68,0.08)",   border: "rgba(239,68,68,0.45)",   color: "#ef4444", label: "SELL",         emoji: "🔴" },
  "STRONG SELL":{ bg: "rgba(239,68,68,0.12)",   border: "rgba(239,68,68,0.55)",   color: "#f87171", label: "STRONG SELL",  emoji: "🔴" },
  UNDERWEIGHT:  { bg: "rgba(249,115,22,0.08)",  border: "rgba(249,115,22,0.45)",  color: "#fb923c", label: "UNDERWEIGHT",  emoji: "🟠" },
  HOLD:         { bg: "rgba(234,179,8,0.08)",   border: "rgba(234,179,8,0.45)",   color: "#eab308", label: "HOLD",         emoji: "🟡" },
  OVERWEIGHT:   { bg: "rgba(6,182,212,0.08)",   border: "rgba(6,182,212,0.45)",   color: "#22d3ee", label: "OVERWEIGHT",   emoji: "🟢" },
  BUY:          { bg: "rgba(34,197,94,0.08)",   border: "rgba(34,197,94,0.45)",   color: "#22c55e", label: "BUY",          emoji: "🟢" },
  "STRONG BUY": { bg: "rgba(34,197,94,0.12)",   border: "rgba(34,197,94,0.55)",   color: "#4ade80", label: "STRONG BUY",   emoji: "🟢" },
}

function detectRating(text: string): Rating {
  // Priority 1: explicit "**Rating**: VALUE" pattern (markdown bold)
  const patterns = [
    /\*\*Rating\*\*:\s*(BUY|OVERWEIGHT|HOLD|UNDERWEIGHT|SELL)/i,
    /Rating:\s*(BUY|OVERWEIGHT|HOLD|UNDERWEIGHT|SELL)/i,
    /Final[^:]*:\s*\*\*(BUY|OVERWEIGHT|HOLD|UNDERWEIGHT|SELL)\*\*/i,
    /FINAL TRANSACTION PROPOSAL:\s*\*\*(BUY|OVERWEIGHT|HOLD|UNDERWEIGHT|SELL)\*\*/i,
  ]
  for (const re of patterns) {
    const m = text.match(re)
    if (m) return RATINGS[m[1].toUpperCase()] ?? RATINGS["HOLD"]
  }

  // Fallback: keyword scan — most bearish first to avoid false positives
  const upper = text.toUpperCase()
  for (const key of ["STRONG SELL", "SELL", "UNDERWEIGHT", "HOLD", "OVERWEIGHT", "STRONG BUY", "BUY"]) {
    if (upper.includes(key)) return RATINGS[key]
  }
  return RATINGS["HOLD"]
}

export default function VerdictCard({ decision, isActive = false }: Props) {
  if (decision.length === 0 && !isActive) return null

  const fullText = decision.join(" ")
  const rating = detectRating(fullText)
  const { bg, border, color, label, emoji } = rating

  return (
    <div
      className={`rounded-xl p-6 panel-fade-in mt-4${isActive && decision.length === 0 ? " verdict-awaiting" : ""}`}
      style={{
        background: bg,
        border: `1px solid ${border}`,
        boxShadow: decision.length > 0 ? `0 0 40px ${color}10` : undefined,
      }}
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <span className="text-xs font-bold tracking-widest uppercase text-zinc-500 block mb-1">
            Portfolio Manager Verdict
          </span>
          {isActive && decision.length === 0 && (
            <span className="text-xs text-zinc-600 font-mono">Awaiting decision...</span>
          )}
        </div>
        {decision.length > 0 && (
          <div className="flex items-center gap-3">
            <span className="text-2xl">{emoji}</span>
            <span
              className="text-3xl font-black tracking-wider verdict-shimmer rounded px-2 py-0.5"
              style={{ color }}
            >
              {label}
            </span>
          </div>
        )}
        {isActive && decision.length === 0 && (
          <span className="flex gap-1">
            {[0, 100, 200].map(d => (
              <span
                key={d}
                className="w-2 h-2 rounded-full animate-bounce"
                style={{ backgroundColor: "#eab308", animationDelay: `${d}ms` }}
              />
            ))}
          </span>
        )}
      </div>

      {decision.length > 0 && (
        <div className="text-xs text-zinc-300 leading-relaxed max-h-56 overflow-y-auto scrollbar-thin">
          <div className="prose prose-invert prose-sm max-w-none overflow-x-auto break-words
            prose-headings:text-zinc-200 prose-strong:text-zinc-100
            prose-table:text-xs prose-td:p-1 prose-th:p-1 agent-prose">
            <ReactMarkdown>{decision.join("\n")}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  )
}
