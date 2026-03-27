"use client"
import { useState, useRef, useEffect, useCallback } from "react"
import { IDX_TICKERS } from "@/lib/idxTickers"

interface Props {
  value: string
  onChange: (v: string) => void
}

export default function TickerInput({ value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const upper = value.toUpperCase()

  // Filter by symbol or name
  const filtered = IDX_TICKERS.filter(t =>
    t.symbol.toUpperCase().includes(upper) ||
    t.name.toUpperCase().includes(upper)
  ).slice(0, 6)

  // Suggest appending .JK if the user typed a bare symbol that matches
  const jkSuggestion = (
    upper.length >= 2 &&
    !upper.includes(".") &&
    IDX_TICKERS.some(t => t.symbol.toUpperCase() === upper + ".JK") &&
    filtered.every(t => t.symbol.toUpperCase() !== upper + ".JK")
  ) ? upper + ".JK" : null

  const suggestions = jkSuggestion
    ? [{ symbol: jkSuggestion, name: `Did you mean ${jkSuggestion}?` }, ...filtered]
    : filtered

  const select = useCallback((symbol: string) => {
    onChange(symbol)
    setOpen(false)
    setHighlighted(0)
  }, [onChange])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open || suggestions.length === 0) return
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setHighlighted(h => Math.min(h + 1, suggestions.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setHighlighted(h => Math.max(h - 1, 0))
    } else if (e.key === "Enter") {
      e.preventDefault()
      if (suggestions[highlighted]) select(suggestions[highlighted].symbol)
    } else if (e.key === "Escape") {
      setOpen(false)
    }
  }

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  // Detect if dropdown should open upward (near bottom of screen)
  const [dropUp, setDropUp] = useState(false)
  const handleFocus = () => {
    if (inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect()
      setDropUp(rect.bottom + 200 > window.innerHeight)
    }
    setOpen(true)
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        ref={inputRef}
        value={value}
        onChange={e => {
          onChange(e.target.value.toUpperCase())
          setOpen(true)
          setHighlighted(0)
        }}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        maxLength={12}
        placeholder="NVDA, BBCA.JK"
        autoComplete="off"
        className="bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm font-mono text-zinc-100 w-36 focus:outline-none focus:border-zinc-500"
      />
      {open && suggestions.length > 0 && (
        <div className={`absolute z-50 w-64 glass-panel rounded-lg border border-zinc-700 overflow-hidden ${dropUp ? "bottom-full mb-1" : "top-full mt-1"}`}>
          {suggestions.map((t, i) => (
            <button
              key={t.symbol}
              onMouseDown={e => { e.preventDefault(); select(t.symbol) }}
              onMouseEnter={() => setHighlighted(i)}
              className={`w-full text-left px-3 py-1.5 text-xs font-mono flex gap-2 transition-colors ${
                i === highlighted ? "bg-zinc-700/60" : "hover:bg-zinc-800/50"
              }`}
            >
              <span className="text-zinc-200 shrink-0">{t.symbol}</span>
              <span className="text-zinc-500 truncate">{t.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
