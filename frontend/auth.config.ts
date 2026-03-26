import type { NextAuthConfig } from "next-auth"

// Edge-compatible base config (no Prisma / native deps).
// Middleware imports this directly; auth.ts spreads it and adds the full provider.
export const authConfig = {
  pages: { signIn: "/login" },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = (user as { id?: string; role?: string }).role
      }
      return token
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        ;(session.user as { id: string; role?: string }).role = token.role as string
      }
      return session
    },
  },
} satisfies NextAuthConfig
