import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { Reveal } from '@/components/lp-reveal';
import { DashboardPanel, LedgerPanel, MechanismPanels, Ticker } from '@/components/lp-mockups';

/**
 * Public landing page.
 *
 * A ledger book: warm ruled paper as the dominant canvas, with deep green
 * bands where the product is shown. Flat panels rather than device frames —
 * a printed ledger has no chrome. Scoped under `.lp`, which pins its own
 * colours so the design holds in either OS theme, and never reaches the app.
 */

const PROBLEMS = [
  'One column per category, then more columns for people.',
  'A single dinner entered twice — and totals that quietly disagree.',
  'No way to ask what a friendship actually cost you.',
  'Every new category means rebuilding the sheet.',
];

const ANSWERS = [
  'Enter ₹800 once. It appears under Outside Food and under Sankalp.',
  'Category and person are independent, never summed together.',
  'Add a person or a category without touching the structure.',
  'Your existing month tabs imported, checked against their own totals.',
];

const LEDGER_POINTS = [
  'Given and received, netted into one balance per person.',
  'Every movement preserved, with the balance that followed it.',
  'Settled in a single gesture when the account clears.',
];

export default async function LandingPage() {
  const session = await getSession();
  const href = session ? '/dashboard' : '/register';
  const cta = session ? 'Enter Money Flow' : 'Begin your ledger';

  return (
    <div className="lp min-h-dvh overflow-x-hidden">
      {/* ------------------------------ Nav ------------------------------ */}
      <header
        className="fixed inset-x-0 top-0 z-50 border-b backdrop-blur-md"
        style={{ borderColor: 'color-mix(in oklab, var(--border-lp) 60%, transparent)', background: 'color-mix(in oklab, var(--background) 80%, transparent)' }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="lp-display text-xl tracking-tight">
            Money <span className="lp-display-em" style={{ color: 'var(--gold)' }}>Flow</span>
          </Link>

          <nav className="hidden gap-8 text-[13px] md:flex" style={{ color: 'var(--muted-fg)' }}>
            {[
              ['The Movement', '#movement'],
              ['The Mechanism', '#mechanism'],
              ['The Ledger', '#ledger'],
            ].map(([label, target]) => (
              <a key={target} href={target} className="transition-colors hover:opacity-70">
                {label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-4">
            {!session && (
              <Link
                href="/login"
                className="hidden sm:block text-[11px] tracking-[0.2em] uppercase"
                style={{ color: 'var(--muted-fg)' }}
              >
                Sign in
              </Link>
            )}
            <Link href={href} className="lp-btn lp-btn-solid !px-5 !py-2.5 !text-[11px]">
              {session ? 'Enter' : 'Get started'}
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* ------------------------------ Hero ----------------------------- */}
        <section id="top" className="lp-paper mx-auto max-w-6xl px-6 pt-40 md:pt-48 pb-24 text-center">
          <Reveal>
            {/* Flex wrapper, so the inline-flex eyebrow gets no line-box leading. */}
            <div className="flex justify-center">
              <span className="lp-label" style={{ color: 'var(--muted-fg)' }}>
                A new standard in personal ledgers
              </span>
            </div>
          </Reveal>

          <Reveal delay={120}>
            <h1 className="lp-display text-5xl md:text-7xl max-w-4xl mx-auto mt-8">
              Every rupee, accounted for.
              <br />
              {/* forest at 70% — the softness is opacity, not a lighter green. */}
              <span className="lp-display-em" style={{ color: 'color-mix(in oklab, var(--forest) 70%, transparent)' }}>
                Every relationship, remembered.
              </span>
            </h1>
          </Reveal>

          <Reveal delay={240}>
            <p
              className="text-[15px] max-w-xl mx-auto mt-8 leading-relaxed"
              style={{ color: 'var(--ink-soft)' }}
            >
              Built with the discipline of a ledger and the ease of nothing at all. What you spent on and who
              you spent it with, kept as two separate truths about a single entry.
            </p>
          </Reveal>

          <Reveal delay={360}>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
              <Link href={href} className="lp-btn lp-btn-solid">
                {cta}
              </Link>
              <a href="#mechanism" className="lp-btn lp-btn-outline">
                Discover the mechanism
              </a>
            </div>
            <p className="lp-eyebrow mt-10 text-[10px]" style={{ color: 'var(--muted-fg)' }}>
              Self-hosted · Your sheet imported in a single pass
            </p>
          </Reveal>
        </section>

        {/* Real figures, then the product — one forest band, as in the reference. */}
        <section className="py-20 md:py-28" style={{ background: 'var(--forest)', color: 'var(--onforest)' }}>
          <Ticker />
          <Reveal>
            <div className="mx-auto mt-16 max-w-6xl px-6">
              <DashboardPanel />
            </div>
          </Reveal>
        </section>

        {/* ---------------------------- The Movement ----------------------- */}
        {/* No ruled paper here — the rules belong to the hero alone. */}
        <section id="movement" className="mx-auto max-w-6xl px-6 py-24 md:py-36">
          <div className="grid gap-16 md:grid-cols-2">
            <Reveal>
              <div>
                <span className="lp-label">The complication</span>
                <h2 className="lp-display mt-6 text-4xl leading-tight md:text-5xl">
                  The spreadsheet was never{' '}
                  <span className="lp-display-em" style={{ color: 'color-mix(in oklab, var(--forest) 70%, transparent)' }}>
                    built for this.
                  </span>
                </h2>
                <ul className="mt-10 text-[14px]">
                  {PROBLEMS.map((line, i) => (
                    <li
                      key={line}
                      className="flex gap-4 border-t py-4 last:border-b"
                      style={{ borderColor: 'var(--border-lp)', color: 'var(--muted-fg)' }}
                    >
                      <span
                        className="font-mono text-[11px]"
                        style={{ color: 'color-mix(in oklab, var(--foreground) 40%, transparent)' }}
                      >
                        0{i + 1}
                      </span>
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>

            {/* Offset down, so the two columns read as a sequence not a pair. */}
            <Reveal delay={150}>
              <div className="md:pt-24">
                <span className="lp-label">A single movement</span>
                <ul className="mt-10 text-[14px]">
                  {ANSWERS.map((line) => (
                    <li
                      key={line}
                      className="flex gap-4 border-t py-4 last:border-b"
                      style={{ borderColor: 'var(--border-lp)' }}
                    >
                      <span className="font-mono text-[11px]" style={{ color: 'var(--gold)' }}>
                        ·
                      </span>
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          </div>
        </section>

        {/* --------------------------- The Mechanism ----------------------- */}
        <section id="mechanism" className="lp-dark px-5 sm:px-10 py-20 sm:py-28">
          <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-14 md:gap-20 items-start">
            <Reveal>
              <span className="lp-label lp-label-dark">
                The mechanism
              </span>
              <h2 className="lp-display text-[32px] sm:text-[46px] mt-6 mb-8">
                Two dimensions.
                <br />
                <span className="lp-display-em" style={{ color: 'var(--gold-500)' }}>
                  One transaction.
                </span>
              </h2>
              <p className="text-[15px] sm:text-[16px] leading-relaxed" style={{ color: 'var(--ivory-300)' }}>
                Dinner with a friend costs ₹800 once. The category records what the money became. The person
                records who it was for. Two separate questions about the same entry — answered without ever
                counting it twice.
              </p>
              <p
                className="lp-display-em text-[17px] sm:text-[19px] mt-9 pl-5 border-l"
                style={{ color: 'var(--gold-500)', borderColor: 'var(--gold-600)' }}
              >
                Not ₹1,600. Not ₹2,400. The same ₹800, read three ways.
              </p>
            </Reveal>

            <Reveal delay={110}>
              <MechanismPanels />
            </Reveal>
          </div>
        </section>

        {/* ----------------------------- The Ledger ------------------------ */}
        <section id="ledger" className="lp-paper px-5 sm:px-10 py-20 sm:py-28">
          <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-14 md:gap-20 items-start">
            <Reveal>
              <span className="lp-label">
                The ledger
              </span>
              <h2 className="lp-display text-[32px] sm:text-[46px] mt-6 mb-8">
                Lending isn&apos;t{' '}
                <span className="lp-display-em" style={{ color: 'var(--green-600)' }}>
                  spending.
                </span>
              </h2>
              <p className="text-[15px] sm:text-[16px] leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
                Money lent comes back. Counted as an expense, it would quietly inflate every figure you rely
                on. So it is kept apart — what you gave, what you received, and the standing balance with each
                person, never mixed into what you actually spent.
              </p>
              <div className="lp-rows mt-9">
                {LEDGER_POINTS.map((t) => (
                  <div key={t} className="flex gap-5 py-5">
                    <span className="pt-0.5" style={{ color: 'var(--gold-600)' }}>
                      ·
                    </span>
                    <span className="text-[15px]" style={{ color: 'var(--ink-soft)' }}>
                      {t}
                    </span>
                  </div>
                ))}
              </div>
            </Reveal>

            <Reveal delay={110}>
              <LedgerPanel />
            </Reveal>
          </div>
        </section>

        {/* --------------------------- Closing band ------------------------ */}
        <section className="lp-paper px-5 sm:px-10 py-24 sm:py-36 text-center">
          <Reveal>
            <h2 className="lp-display text-[36px] sm:text-[58px] max-w-3xl mx-auto">
              Precision in{' '}
              <span className="lp-display-em" style={{ color: 'var(--green-600)' }}>
                every entry.
              </span>
            </h2>
            <p className="text-[15px] max-w-md mx-auto mt-7" style={{ color: 'var(--ink-soft)' }}>
              Bring your months across from the sheet, and keep the habit that took you years to build.
            </p>
            <Link href={href} className="lp-btn lp-btn-solid mt-10">
              {cta}
            </Link>
          </Reveal>
        </section>
      </main>

      <footer
        className="lp-dark px-5 sm:px-10 py-12 flex flex-col sm:flex-row items-center justify-between gap-6"
      >
        <span className="lp-display text-[19px]">
          Money <span className="lp-display-em" style={{ color: 'var(--gold-500)' }}>Flow</span>
        </span>
        <div className="flex flex-wrap justify-center gap-8 text-[10px] tracking-[0.18em] uppercase" style={{ color: 'var(--ivory-300)' }}>
          <Link href="/login" className="hover:opacity-70">Sign in</Link>
          <Link href="/register" className="hover:opacity-70">Create account</Link>
          <a href="https://github.com/siddharttth/money-flow" target="_blank" rel="noreferrer" className="hover:opacity-70">
            Source
          </a>
        </div>
        <span className="text-[10px] tracking-[0.14em]" style={{ color: 'var(--ivory-300)', opacity: 0.6 }}>
          © {new Date().getFullYear()} Money Flow
        </span>
      </footer>
    </div>
  );
}
