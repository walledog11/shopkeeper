import { notFound } from "next/navigation"
import { tips } from "../../_components/help/content/tips"
import ArticlePageClient from "./ArticlePageClient"

interface Props {
  params: Promise<{ articleId: string }>
}

export default async function ArticlePage({ params }: Props) {
  const { articleId } = await params
  const article = tips.articles.find(a => a.id === articleId)

  if (!article) notFound()

  const relatedArticles = tips.articles
    .filter(a => a.id !== article.id && a.tag === article.tag)
    .slice(0, 3)

  return <ArticlePageClient article={article} relatedArticles={relatedArticles} />
}
