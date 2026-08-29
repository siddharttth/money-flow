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
                <h2 className="lp-display mt-6 text-4xl md:text-5xl" style={{ lineHeight: 1.25 }}>
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
        {/* bg-forest — lighter than the cards it holds, so they read as inset. */}
        <section
          id="mechanism"
          className="py-24 md:py-36"
          style={{ background: 'var(--forest)', color: 'var(--onforest)' }}
        >
          <div className="mx-auto grid max-w-6xl items-start gap-16 px-6 md:grid-cols-2">
            <Reveal>
              <div className="md:sticky md:top-32">
                {/* Plain eyebrow here — no flanking rules on this one. */}
                <p className="lp-eyebrow" style={{ color: 'var(--gold)' }}>
                  The mechanism
                </p>
                <h2 className="lp-display mt-6 text-[38px] md:text-[50px]" style={{ lineHeight: 1.25 }}>
                  Two dimensions.
                  <br />
                  <span className="lp-display-em" style={{ color: 'var(--onforest-muted)' }}>
                    One transaction.
                  </span>
                </h2>
                <p
                  className="mt-8 max-w-md text-[16px] leading-relaxed"
                  style={{ color: 'var(--onforest-muted)' }}
                >
                  Dinner with a friend costs ₹800 once. The category records what the money became. The
                  person records who it was for. Two separate questions about the same entry — answered
                  without ever counting it twice.
                </p>
                <p
                  className="lp-display-em mt-8 border-l-2 pl-5 text-[19px]"
                  style={{
                    borderColor: 'color-mix(in oklab, var(--gold) 60%, transparent)',
                    color: 'var(--gold-soft)',
                  }}
                >
                  Not ₹1,600. Not ₹2,400. The same ₹800, read three ways.
                </p>
              </div>
            </Reveal>

            <Reveal delay={150}>
              <MechanismPanels />
            </Reveal>
          </div>
        </section>

        {/* ----------------------------- The Ledger ------------------------ */}
        {/* Plain paper — the rules stay in the hero. */}
        <section id="ledger" className="mx-auto max-w-6xl px-6 py-24 md:py-36">
          <div className="grid items-start gap-16 md:grid-cols-2">
            <Reveal>
              <div className="md:sticky md:top-32">
                <span className="lp-label">The ledger</span>
                <h2 className="lp-display mt-6 text-4xl md:text-5xl" style={{ lineHeight: 1.25 }}>
                  Lending isn&rsquo;t{' '}
                  <span className="lp-display-em" style={{ color: 'color-mix(in oklab, var(--forest) 70%, transparent)' }}>
                    spending.
                  </span>
                </h2>
                <p className="mt-8 max-w-md text-[15px] leading-relaxed" style={{ color: 'var(--muted-fg)' }}>
                  Money lent comes back. Counted as an expense, it would quietly inflate every figure you
                  rely on. So it is kept apart — what you gave, what you received, and the standing balance
                  with each person, never mixed into what you actually spent.
                </p>
                <ul className="mt-8 text-[14px]">
                  {LEDGER_POINTS.map((line) => (
                    <li
                      key={line}
                      className="flex gap-4 border-t py-4 last:border-b"
                      style={{ borderColor: 'var(--border-lp)', color: 'var(--muted-fg)' }}
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

            <Reveal delay={150}>
              {/* The panel is nested on forest, so it lifts off the paper. */}
              <div className="rounded-xl p-4 md:p-6" style={{ background: 'var(--forest)' }}>
                <LedgerPanel />
              </div>
            </Reveal>
          </div>
        </section>

        {/* --------------------------- Closing band ------------------------ */}
        {/* Ruled again here, per the reference, with a hairline above. */}
        <section id="begin" className="lp-paper border-t" style={{ borderColor: 'var(--border-lp)' }}>
          <div className="mx-auto max-w-6xl px-6 py-28 text-center md:py-40">
            <Reveal>
              <h2 className="lp-display mx-auto max-w-2xl text-5xl leading-[1.05] md:text-7xl">
                Precision in{' '}
                <span className="lp-display-em" style={{ color: 'color-mix(in oklab, var(--forest) 70%, transparent)' }}>
                  every entry.
                </span>
              </h2>
            </Reveal>
            <Reveal delay={150}>
              <p className="mx-auto mt-8 max-w-md text-[15px] leading-relaxed" style={{ color: 'var(--muted-fg)' }}>
                Bring your months across from the sheet, and keep the habit that took you years to build.
              </p>
            </Reveal>
            <Reveal delay={280}>
              <Link href={href} className="lp-btn lp-btn-solid mt-10 !px-8 !py-4">
                {cta}
              </Link>
            </Reveal>
          </div>
        </section>

      </main>

      <footer className="py-14" style={{ background: 'var(--forest-ink)', color: 'var(--onforest)' }}>
        {/* Same max-w-6xl container as the page, so it lines up with everything. */}
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-8 px-6 md:flex-row">
          <span className="lp-display text-xl">
            Money{' '}
            <span className="lp-display-em" style={{ color: 'var(--gold)' }}>
              Flow
            </span>
          </span>

          <div className="flex gap-8 text-[12px] uppercase tracking-[0.2em]" style={{ color: 'var(--onforest-muted)' }}>
            <Link href="/login" className="lp-hoverable">
              Sign in
            </Link>
            <Link href="/register" className="lp-hoverable">
              Create account
            </Link>
            <a
              href="https://github.com/siddharttth/money-flow"
              target="_blank"
              rel="noreferrer"
              className="lp-hoverable"
            >
              Source
            </a>
          </div>

          <p className="font-mono text-[11px]" style={{ color: 'var(--onforest-muted)' }}>
            © {new Date().getFullYear()} Money Flow
          </p>
        </div>
      </footer>
    </div>
  );
}
