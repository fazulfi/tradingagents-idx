"use client"

import { useState } from "react"
import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      const result = await signIn("credentials", {
        username,
        password,
        redirect: false,
      })
      if (result?.error) {
        setError("Invalid username or password")
      } else {
        router.replace("/")
      }
    } catch {
      setError("An unexpected error occurred")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-[#09090b] font-mono"
      style={{
        backgroundImage:
          "radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)",
        backgroundSize: "24px 24px",
      }}
    >
      <div className="w-full max-w-sm mx-4">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-green-500 text-xs tracking-[0.3em] uppercase mb-2">
            ▶ SYSTEM READY
          </div>
          <h1 className="text-2xl font-bold text-zinc-100 tracking-tight">
            AI Trading War Room
          </h1>
          <p className="text-zinc-500 text-xs mt-1 tracking-widest">
            SECURE ACCESS TERMINAL
          </p>
        </div>

        {/* Card */}
        <form
          onSubmit={handleSubmit}
          className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-8 shadow-2xl backdrop-blur"
        >
          <div className="space-y-5">
            <div>
              <label className="block text-xs text-zinc-400 mb-1.5 tracking-widest uppercase">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
                className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600/30 transition font-mono"
                placeholder="admin"
              />
            </div>

            <div>
              <label className="block text-xs text-zinc-400 mb-1.5 tracking-widest uppercase">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600/30 transition font-mono"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="text-red-400 text-xs border border-red-900/50 bg-red-950/30 rounded px-3 py-2">
                ✗ {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-green-700 hover:bg-green-600 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm font-semibold py-2.5 rounded transition tracking-wide"
            >
              {loading ? "AUTHENTICATING..." : "ACCESS TERMINAL"}
            </button>
          </div>
        </form>

        <p className="text-center text-zinc-700 text-xs mt-6 tracking-widest">
          UNAUTHORIZED ACCESS PROHIBITED
        </p>
      </div>
    </div>
  )
}
