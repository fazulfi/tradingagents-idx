import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "AI Trading War Room",
  description: "Multi-agent trading analysis",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-[#09090b] text-zinc-100 min-h-screen">{children}</body>
    </html>
  )
}
