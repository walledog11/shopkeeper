import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import { db } from "@shopkeeper/db"
import { rateLimit, tooManyRequests } from "@/lib/server/rate-limit"

const THIRTY_DAYS = 60 * 60 * 24 * 30

export async function POST(req: Request) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const rl = await rateLimit(`feedback:${orgId ?? userId}`, 1, THIRTY_DAYS)
  if (!rl.success) return tooManyRequests(rl.reset)

  const body = await req.json()
  const rating = Number(body.rating)
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: "Invalid rating" }, { status: 400 })
  }
  const comment = typeof body.comment === "string" ? body.comment.slice(0, 280) : null
  const categories = Array.isArray(body.categories)
    ? body.categories.filter((c: unknown) => typeof c === "string").slice(0, 10)
    : []

  await db.feedback.create({
    data: {
      userId,
      organizationId: orgId ?? null,
      rating,
      comment: comment || null,
      categories,
    },
  })

  return NextResponse.json({ ok: true })
}
