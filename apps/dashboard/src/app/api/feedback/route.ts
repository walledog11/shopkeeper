import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"

export async function POST(req: Request) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { rating, comment } = await req.json()
  console.log("[feedback]", { userId, orgId, rating, comment })

  return NextResponse.json({ ok: true })
}
