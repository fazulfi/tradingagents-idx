import { PrismaClient } from "@prisma/client"
import bcrypt from "bcrypt"
import fs from "fs"
import path from "path"

const prisma = new PrismaClient()

async function main() {
  // Determine admin password
  const rawPassword = process.env.ADMIN_PASSWORD || ""
  let password: string
  if (!rawPassword) {
    console.warn(
      "\n⚠️  WARNING: Using default password. Set ADMIN_PASSWORD env var before going live!\n"
    )
    password = "password123"
  } else {
    password = rawPassword
  }

  const hashed = await bcrypt.hash(password, 12)

  // Upsert admin user
  const admin = await prisma.user.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      username: "admin",
      password: hashed,
      role: "ADMIN",
      name: "Admin",
    },
  })
  console.log(`✓ Admin user: ${admin.id} (${admin.username})`)
  console.log(`\n📝 Add to .env.local:\n   ADMIN_USER_ID=${admin.id}\n`)

  // Upsert UserSettings for admin
  await prisma.userSettings.upsert({
    where: { userId: admin.id },
    update: {},
    create: { userId: admin.id },
  })
  console.log("✓ UserSettings created for admin")

  // Migrate jobs.json if it exists
  const jobsPath = path.resolve(path.join(__dirname, "../../jobs.json"))
  if (fs.existsSync(jobsPath)) {
    try {
      const raw = fs.readFileSync(jobsPath, "utf8")
      // jobs.json is stored as [[id, job], ...] pairs
      const entries: [string, Record<string, unknown>][] = JSON.parse(raw)
      let migrated = 0
      for (const [id, job] of entries) {
        await prisma.job.upsert({
          where: { id },
          update: {},
          create: {
            id,
            userId: admin.id,
            ticker: (job.ticker as string) || "",
            date: (job.date as string) || "",
            model: (job.model as string) || "",
            status: (job.status as string) || "error",
            result: JSON.stringify(job),
            createdAt: job.createdAt ? new Date(job.createdAt as number) : new Date(),
            updatedAt: job.updatedAt ? new Date(job.updatedAt as number) : new Date(),
          },
        })
        migrated++
      }
      console.log(`✓ Migrated ${migrated} jobs from jobs.json`)
    } catch (e) {
      console.warn("⚠️  Could not migrate jobs.json:", e)
    }
  } else {
    console.log("ℹ  No jobs.json found — skipping migration")
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
