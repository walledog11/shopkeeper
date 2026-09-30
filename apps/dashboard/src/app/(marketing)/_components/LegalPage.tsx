import type { ReactNode } from 'react'
import { Footer } from './Footer'
import { Navbar } from './Navbar'

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
      <Navbar />

      <article className="mx-auto max-w-4xl px-5 py-12 sm:py-16">
        <p className="m-eyebrow">Effective {effectiveDate}</p>
        <h1 className="m-display m-h1 mt-4">{title}</h1>
        <div className="mt-6 max-w-3xl text-base leading-7 text-stone-700">{intro}</div>

        <div className="mt-10 space-y-10">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="m-display text-[1.625rem]">{section.title}</h2>
              <div className="mt-3 space-y-3 text-base leading-7 text-stone-700">{section.body}</div>
            </section>
          ))}
        </div>
      </article>

      <Footer />
    </main>
  )
}
