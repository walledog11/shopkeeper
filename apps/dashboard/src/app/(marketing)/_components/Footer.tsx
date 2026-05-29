import Link from "next/link";

export function Footer() {
  return (
    <div className="flex justify-between align-center flex-wrap gap-5 text-xs p-4 border-t border-t-solid border-t-white/[0.08] [font-family:var(--m-mono)] text-white/[0.5] bg-stone-900" >
      <div>clerk · made for shopkeepers</div>
      <div className="flex gap-4 flex-wrap" >
        <Link href="/privacy" className="inherit">Privacy</Link>
        <Link href="/terms" className="inherit">Terms</Link>
        <a href="mailto:hello@useclerk.co" className="inherit">Contact</a>
      </div>
    </div>
  );
}
