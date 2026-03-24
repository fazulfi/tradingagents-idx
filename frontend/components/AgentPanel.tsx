"use client"
import { useEffect, useRef } from "react"

interface Props {
  title: string
  icon: string
  content: string[]
  accentColor: string
  glowClass?: string
  isActive?: boolean
}

export default function AgentPanel({ title, icon, content, accentColor, glowClass = "", isActive = false }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }) }, [content])
  if (content.length === 0 && !isActive) return null
  return (
    <div className={`glass-panel rounded-lg p-4 panel-fade-in ${glowClass}`}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">{icon}</span>
        <span className="text-xs font-bold tracking-widest uppercase" style={{ color: accentColor }}>{title}</span>
        {isActive && (
          <span className="ml-auto flex gap-1">
            {[0,100,200].map(d => (
              <span key={d} className="w-1.5 h-1.5 rounded-full animate-bounce"
                style={{ backgroundColor: accentColor, animationDelay: `${d}ms` }} />
            ))}
          </span>
        )}
      </div>
      <div className="text-xs text-zinc-300 leading-relaxed space-y-1 max-h-64 overflow-y-auto scrollbar-thin">
        {content.map((line, i) => <p key={i} className="font-mono">{line}</p>)}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
