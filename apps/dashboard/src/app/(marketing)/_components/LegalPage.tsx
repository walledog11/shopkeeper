import type { ReactNode } from 'react'
import Link from 'next/link'
import { Footer } from './Footer'

type LegalSection = {
  title: string
  body: ReactNode
}

export function LegalPage({
  title,
  effectiveDate,
  intro,
  sections,
}: {
  title: string
  effectiveDate: string
  intro: ReactNode
  sections: LegalSection[]
}) {
  return (
    <main className="min-h-screen bg-white text-stone-900">
      <header className="border-b border-stone-200">
        <div className="mx-auto flex max-w-4xl items-center justify-between p-5">
          <Link href="/" className="flex items-center gap-2 text-base font-semibold text-stone-900">
            <span className="inline-block size-3 rounded-full bg-green-400" />
            clerk
          </Link>
          <Link href="/signup" className="text-sm font-semibold text-stone-700 hover:text-stone-950">
            Start free
          </Link>
        </div>
      </header>

      <article className="mx-auto max-w-4xl px-5 py-12 sm:py-16">
        <p className="text-sm font-medium uppercase text-stone-500">Effective {effectiveDate}</p>
        <h1 className="mt-3 text-4xl font-semibold text-stone-950 sm:text-5xl">{title}</h1>
        <div className="mt-6 max-w-3xl text-base leading-7 text-stone-700">{intro}</div>

        <div className="mt-10 space-y-10">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-xl font-semibold text-stone-950">{section.title}</h2>
              <div className="mt-3 space-y-3 text-base leading-7 text-stone-700">{section.body}</div>
            </section>
          ))}
        </div>
      </article>

      <Footer />
    </main>
  )
}
