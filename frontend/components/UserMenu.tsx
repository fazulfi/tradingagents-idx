"use client"

import { useSession, signOut } from "next-auth/react"
import { useState } from "react"

export default function UserMenu() {
  const { data: session } = useSession()
  const [open, setOpen] = useState(false)

  if (!session?.user) return null

  const role = (session.user as { role?: string }).role ?? "USER"
  const name = session.user.name ?? "user"

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-3 py-1.5 rounded border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800/60 transition text-xs font-mono text-zinc-300"
      >
        <span className="text-green-500">▶</span>
        <span>{name}</span>
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wider ${
            role === "ADMIN"
              ? "bg-green-900/60 text-green-400 border border-green-800"
              : "bg-zinc-800 text-zinc-400 border border-zinc-700"
          }`}
        >
          {role}
        </span>
        <span className="text-zinc-600">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-40 rounded border border-zinc-800 bg-zinc-900 shadow-xl z-50">
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="w-full text-left px-4 py-2.5 text-xs font-mono text-zinc-300 hover:bg-zinc-800 hover:text-red-400 transition"
          >
            ✗ Sign Out
          </button>
        </div>
      )}
    </div>
  )
}
