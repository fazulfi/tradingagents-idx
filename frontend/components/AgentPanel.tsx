"use client"
import { useState, useEffect, useRef } from "react"
import ReactMarkdown from "react-markdown"
import { useMediaQuery } from "@/lib/hooks"

interface Props {
  title: string
  icon: string
  content: string[]
  accentColor: string
  glowClass?: string
  isActive?: boolean
}

export default function AgentPanel({ title, icon, content, accentColor, glowClass = "", isActive = false }: Props) {
  const isMobile = useMediaQuery("(max-width: 768px)")
  const [isCollapsed, setIsCollapsed] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Set initial collapse based on mobile/desktop
  useEffect(() => {
    setIsCollapsed(isMobile)
  }, [isMobile])

  // Auto-expand when agent becomes active
  useEffect(() => {
    if (isActive) setIsCollapsed(false)
  }, [isActive])

  // Auto-collapse on mobile when agent finishes
  useEffect(() => {
    if (!isActive && isMobile && content.length > 0) {
      setIsCollapsed(true)
    }
  }, [isActive, isMobile, content.length])

  // Scroll to bottom when content updates (only if expanded)
  useEffect(() => {
    if (!isCollapsed) bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [content, isCollapsed])

  if (content.length === 0 && !isActive) return null

  const statusIcon = isActive
    ? <span style={{ color: "#eab308" }}>⏳</span>
    : content.length > 0
      ? <span>✅</span>
      : <span className="text-zinc-500">⭕</span>

  return (
    <div
      className={`glass-panel rounded-lg panel-fade-in ${glowClass}`}
      style={{
        borderLeft: `4px solid ${accentColor}`,
        boxShadow: isActive
          ? `0 0 20px ${accentColor}18, inset 0 0 0 1px ${accentColor}12`
          : undefined,
      }}
    >
      <button
        onClick={() => setIsCollapsed(b => !b)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left"
      >
        <span className="text-lg">{icon}</span>
        <span className="text-xs font-bold tracking-widest uppercase" style={{ color: accentColor }}>{title}</span>
        <span className="ml-1 text-xs">{statusIcon}</span>
        {isActive && (
          <span className={`flex gap-1 ml-1 ${isActive ? "agent-active-border" : ""}`}>
            {[0, 100, 200].map(d => (
              <span key={d} className="w-1.5 h-1.5 rounded-full animate-bounce"
                style={{ backgroundColor: accentColor, animationDelay: `${d}ms` }} />
            ))}
          </span>
        )}
        <span className="ml-auto text-xs text-zinc-500">{isCollapsed ? "▶" : "▼"}</span>
      </button>

      <div className={`overflow-hidden transition-all duration-300 ${isCollapsed ? "max-h-0" : "max-h-[500px]"}`}>
        <div className="px-4 pb-4">
          <div className="text-xs text-zinc-300 leading-relaxed max-h-64 overflow-y-auto scrollbar-thin">
            <div className="prose prose-invert prose-sm max-w-none overflow-x-auto break-words
              prose-headings:text-zinc-200 prose-strong:text-zinc-100
              prose-table:text-xs prose-td:p-1 prose-th:p-1 agent-prose">
              <ReactMarkdown>{content.join("\n")}</ReactMarkdown>
            </div>
            <div ref={bottomRef} />
          </div>
        </div>
      </div>
    </div>
  )
}
