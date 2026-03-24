export function sanitizeTicker(raw: string | null): string | null {
  if (!raw) return null
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9.\-]/g, "").slice(0, 12)
  return cleaned.length >= 1 ? cleaned : null
}

export function sanitizeDate(raw: string | null): string | null {
  if (!raw) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null
  const d = new Date(raw)
  if (isNaN(d.getTime())) return null
  const y = d.getFullYear()
  return y >= 2000 && y <= 2030 ? raw : null
}

export function detectVerdict(lines: string[]): string {
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
