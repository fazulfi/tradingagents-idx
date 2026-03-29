import { defineConfig } from 'prisma/config'

export default defineConfig({
  datasourceUrl: process.env.DATABASE_URL ?? "file:./dev.db",
})
