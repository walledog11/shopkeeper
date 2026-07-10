import { NextResponse } from "next/server"
import { db } from "@shopkeeper/db"
import { readRequiredJsonObject } from "@/lib/api/body"
import { withOrgRoute } from "@/lib/api/route"
import {
  CONTEXT_CATEGORIES,
  contextTitle,
  inferContextCategory,
  type ContextCategory,
} from "@/lib/memory/context"

const validCategories = new Set<ContextCategory>(CONTEXT_CATEGORIES.map(item => item.value))

export const POST = withOrgRoute(
  { context: "KB context POST", errorMessage: "Failed to add context", requireBillingWriteAllowed: true },
  async ({ org, request }) => {
    const body = await readRequiredJsonObject(request)
    const content = typeof body.content === "string" ? body.content.trim() : ""
    const category = typeof body.category === "string" ? body.category as ContextCategory : "auto"
    const correctionTargetId = typeof body.correctionTargetId === "string" ? body.correctionTargetId : null

    if (!content || content.length > 4000) {
      return NextResponse.json({ error: "Context must be between 1 and 4,000 characters." }, { status: 400 })
    }
    if (!validCategories.has(category)) {
      return NextResponse.json({ error: "Invalid context topic." }, { status: 400 })
    }

    if (correctionTargetId) {
      const target = await db.kbArticle.findFirst({
        where: { id: correctionTargetId, organizationId: org.id },
        include: { knowledgeBase: { select: { source: true } } },
      })
      if (!target) return NextResponse.json({ error: "Context to correct was not found." }, { status: 404 })
      const manual = target.knowledgeBase.source === "user"
        && !target.tags.some(tag => tag.toLowerCase() === "agent-learned")
      if (manual) {
        return NextResponse.json({ error: "Your own notes can be edited directly." }, { status: 400 })
      }
    }

    let notes = await db.knowledgeBase.findFirst({
      where: { organizationId: org.id, source: "user", name: { equals: "Notes", mode: "insensitive" } },
      orderBy: { createdAt: "asc" },
    })
    notes ??= await db.knowledgeBase.create({
      data: { organizationId: org.id, name: "Notes", source: "user" },
    })

    const topic = category === "auto" ? inferContextCategory(content) : category
    const tags: string[] = [topic]
    if (correctionTargetId) tags.push("merchant-override", `overrides:${correctionTargetId}`)

    const article = await db.kbArticle.create({
      data: {
        organizationId: org.id,
        knowledgeBaseId: notes.id,
        title: contextTitle(content),
        body: content,
        tags,
      },
    })
    return NextResponse.json({ article }, { status: 201 })
  },
)
