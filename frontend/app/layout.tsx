import type { Metadata } from "next"
import "./globals.css"
import { Providers } from "./providers"
import UserMenu from "@/components/UserMenu"

export const metadata: Metadata = {
  title: "AI Trading War Room",
  description: "Multi-agent trading analysis",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-[#09090b] text-zinc-100 min-h-screen">
        <Providers>
          {/* Top-right user menu bar */}
          <div className="fixed top-3 right-4 z-50">
            <UserMenu />
          </div>
          {children}
        </Providers>
      </body>
    </html>
  )
}
