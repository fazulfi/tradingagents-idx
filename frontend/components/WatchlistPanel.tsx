"use client"

import { useState, useEffect } from "react"

interface Props {
  setTicker: (ticker: string) => void
  handleRun: () => void
}

export default function WatchlistPanel({ setTicker, handleRun }: Props) {
  const [tickers, setTickers] = useState<string[]>([])
  const [newTicker, setNewTicker] = useState("")
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    fetch("/api/watchlist")
      .then((r) => r.json())
      .then((data: string[]) => {
        if (Array.isArray(data)) setTickers(data)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleAdd = async () => {
    const t = newTicker.trim().toUpperCase()
    if (!t) return
    setAdding(true)
    setError("")
    try {
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: t }),
      })
      if (res.ok) {
        setTickers((prev) => [...prev, t])
        setNewTicker("")
      } else {
        const data = await res.json() as { error?: string }
        setError(data.error ?? "Failed to add ticker")
      }
    } catch {
      setError("Network error")
    } finally {
      setAdding(false)
    }
  }

  const handleRemove = async (ticker: string) => {
    try {
      await fetch("/api/watchlist", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker }),
      })
      setTickers((prev) => prev.filter((t) => t !== ticker))
    } catch {}
  }

  const handleAnalyze = (ticker: string) => {
    setTicker(ticker)
    // Give state a tick to propagate before running
    setTimeout(() => handleRun(), 0)
  }

  return (
    <div className="border border-zinc-800/60 rounded-lg bg-zinc-900/40 p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-green-500 text-xs">■</span>
        <span className="text-xs font-mono text-zinc-400 tracking-widest uppercase">Watchlist</span>
      </div>

      {/* Add ticker row */}
      <div className="flex gap-2 mb-3">
        <input
          type="text"
          value={newTicker}
          onChange={(e) => setNewTicker(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          placeholder="BBCA.JK"
          className="flex-1 bg-zinc-950 border border-zinc-700 rounded px-3 py-1.5 text-xs font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600/30 transition"
          maxLength={12}
        />
        <button
          onClick={handleAdd}
          disabled={adding || !newTicker.trim()}
          className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-300 text-xs font-mono rounded border border-zinc-700 transition"
        >
          + Add
        </button>
      </div>

      {error && (
        <p className="text-red-400 text-xs mb-2">{error}</p>
      )}

      {/* Ticker chips */}
      {loading ? (
        <p className="text-zinc-600 text-xs font-mono">Loading...</p>
      ) : tickers.length === 0 ? (
        <p className="text-zinc-600 text-xs font-mono">No tickers saved. Add one above.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {tickers.map((ticker) => (
            <div
              key={ticker}
              className="flex items-center gap-1 bg-zinc-800/60 border border-zinc-700 rounded px-2 py-1"
            >
              <button
                onClick={() => handleAnalyze(ticker)}
                title={`Analyze ${ticker}`}
                className="text-green-500 hover:text-green-400 text-xs font-mono transition"
              >
                ▶
              </button>
              <span className="text-xs font-mono text-zinc-200">{ticker}</span>
              <button
                onClick={() => handleRemove(ticker)}
                title={`Remove ${ticker}`}
                className="text-zinc-600 hover:text-red-400 text-xs font-mono transition ml-0.5"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
