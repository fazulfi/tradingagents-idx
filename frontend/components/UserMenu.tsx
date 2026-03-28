"use client"

import { useSession, signOut } from "next-auth/react"
import { useState, useRef, useEffect } from "react"

export default function UserMenu() {
  const { data: session } = useSession()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  if (!session?.user) return null

  const role = (session.user as { role?: string }).role ?? "USER"
  const name = session.user.name ?? "user"
  const initials = name.slice(0, 2).toUpperCase()

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 6,
          padding: "4px 10px 4px 6px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
        className="hover:bg-white/[0.08] transition-colors"
      >
        {/* Avatar */}
        <div style={{
          width: 22,
          height: 22,
          borderRadius: "50%",
          background: "rgba(34,197,94,0.2)",
          border: "1px solid rgba(34,197,94,0.4)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: "#22c55e", fontFamily: "monospace" }}>
            {initials}
          </span>
        </div>
        <span className="text-[11px] font-mono text-zinc-300 hidden sm:block">{name}</span>
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wider hidden sm:block ${
            role === "ADMIN"
              ? "bg-green-900/60 text-green-400 border border-green-800"
              : "bg-zinc-800 text-zinc-400 border border-zinc-700"
          }`}
        >
          {role}
        </span>
        <span className="text-zinc-600 text-[10px]">▾</span>
      </button>

      {open && (
        <div style={{
          position: "absolute",
          top: 48,
          right: 0,
          width: 200,
          background: "#18181b",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 8,
          zIndex: 50,
          boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
          overflow: "hidden",
        }}>
          {/* Dropdown header */}
          <div style={{ padding: "12px 12px 10px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
            className="flex items-center gap-3">
            <div style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: "rgba(34,197,94,0.2)",
              border: "1px solid rgba(34,197,94,0.4)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#22c55e", fontFamily: "monospace" }}>
                {initials}
              </span>
            </div>
            <div>
              <p className="text-[11px] font-mono text-zinc-200 font-semibold">{name}</p>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wider ${
                role === "ADMIN"
                  ? "bg-green-900/60 text-green-400 border border-green-800"
                  : "bg-zinc-800 text-zinc-400 border border-zinc-700"
              }`}>{role}</span>
            </div>
          </div>

          {/* Menu items */}
          <div className="py-1">
            <button
              onClick={() => setOpen(false)}
              className="w-full text-left flex items-center gap-2 text-zinc-400 hover:bg-white/[0.04] transition-colors"
              style={{ padding: "9px 12px", fontSize: 11, fontFamily: "monospace" }}
            >
              <span>⚙</span>
              <span>Settings</span>
            </button>

            {role === "ADMIN" && (
              <button
                onClick={() => setOpen(false)}
                className="w-full text-left flex items-center gap-2 text-zinc-400 hover:bg-white/[0.04] transition-colors"
                style={{ padding: "9px 12px", fontSize: 11, fontFamily: "monospace" }}
              >
                <span>👥</span>
                <span>Manage Users</span>
              </button>
            )}

            <button
              onClick={() => setOpen(false)}
              className="w-full text-left flex items-center gap-2 text-zinc-400 hover:bg-white/[0.04] transition-colors"
              style={{ padding: "9px 12px", fontSize: 11, fontFamily: "monospace" }}
            >
              <span>📊</span>
              <span>Usage Stats</span>
            </button>

            <hr style={{ borderColor: "rgba(255,255,255,0.07)", margin: "4px 0" }} />

            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="w-full text-left flex items-center gap-2 hover:bg-rose-500/[0.05] transition-colors text-rose-400"
              style={{ padding: "9px 12px", fontSize: 11, fontFamily: "monospace" }}
            >
              <span>✗</span>
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
