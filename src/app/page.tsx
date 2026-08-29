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
      <nav
        className="fixed top-0 inset-x-0 z-50 h-[72px] flex items-center justify-between px-5 sm:px-10 border-b"
        style={{ background: 'var(--paper)', borderColor: 'var(--rule)' }}
      >
        <Link href="/" className="lp-display text-[21px]">
          Money <span className="lp-display-em" style={{ color: 'var(--gold-600)' }}>Flow</span>
        </Link>

        <div className="hidden md:flex items-center gap-9 text-[14px]" style={{ color: 'var(--ink-soft)' }}>
          <a href="#movement" className="hover:opacity-60 transition-opacity">The Movement</a>
          <a href="#mechanism" className="hover:opacity-60 transition-opacity">The Mechanism</a>
          <a href="#ledger" className="hover:opacity-60 transition-opacity">The Ledger</a>
        </div>

        <div className="flex items-center gap-5">
          {!session && (
            <Link
              href="/login"
              className="hidden sm:block text-[10.5px] tracking-[0.18em] uppercase"
              style={{ color: 'var(--ink-soft)' }}
            >
              Sign in
            </Link>
          )}
          <Link href={href} className="lp-btn lp-btn-solid !px-5 !py-2.5 !min-h-0 !text-[10px]">
            {session ? 'Enter' : 'Get started'}
          </Link>
        </div>
      </nav>

      <main className="pt-[72px]">
        {/* ------------------------------ Hero ----------------------------- */}
        <section className="lp-paper px-5 sm:px-10 pt-20 sm:pt-28 pb-16 sm:pb-24 text-center">
          <Reveal>
            <span className="lp-label mb-9" style={{ color: 'var(--ink-soft)' }}>
              A new standard in personal ledgers
            </span>
          </Reveal>

          <Reveal delay={70}>
            <h1 className="lp-display text-[38px] leading-[1.08] sm:text-[62px] md:text-[76px] max-w-5xl mx-auto mt-7">
              Every rupee, accounted for.
              <br />
              <span className="lp-display-em" style={{ color: 'var(--green-600)' }}>
                Every relationship, remembered.
              </span>
            </h1>
          </Reveal>

          <Reveal delay={140}>
            <p
              className="text-[15px] sm:text-[16px] max-w-xl mx-auto mt-9 leading-relaxed"
              style={{ color: 'var(--ink-soft)' }}
            >
              Built with the discipline of a ledger and the ease of nothing at all. What you spent on and who
              you spent it with, kept as two separate truths about a single entry.
            </p>
          </Reveal>

          <Reveal delay={210}>
            <div className="flex flex-col sm:flex-row gap-3 justify-center items-center mt-10">
              <Link href={href} className="lp-btn lp-btn-solid w-full sm:w-auto">
                {cta}
              </Link>
              <a href="#mechanism" className="lp-btn lp-btn-outline w-full sm:w-auto">
                Discover the mechanism
              </a>
            </div>
            <p
              className="text-[10px] tracking-[0.2em] uppercase mt-9"
              style={{ color: 'var(--ink-soft)', opacity: 0.7 }}
            >
              Self-hosted · Your sheet imported in a single pass
            </p>
          </Reveal>
        </section>

        {/* Real figures, running past. */}
        <Ticker />

        {/* --------------------------- The product ------------------------- */}
        <section className="lp-dark px-5 sm:px-10 py-16 sm:py-24">
          <Reveal>
            <div className="max-w-6xl mx-auto">
              <DashboardPanel />
            </div>
          </Reveal>
        </section>

        {/* ---------------------------- The Movement ----------------------- */}
        <section id="movement" className="lp-paper px-5 sm:px-10 py-20 sm:py-28">
          <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-14 md:gap-20 items-start">
            <Reveal>
              <span className="lp-label lp-label-start mb-8" style={{ color: 'var(--ink-soft)' }}>
                The complication
              </span>
              <h2 className="lp-display text-[32px] sm:text-[44px] mt-6 mb-9">
                The spreadsheet was never{' '}
                <span className="lp-display-em" style={{ color: 'var(--green-600)' }}>
                  built for this.
                </span>
              </h2>
              <div className="lp-rows">
                {PROBLEMS.map((t, i) => (
                  <div key={t} className="flex gap-5 py-5">
                    <span className="lp-mono text-[11px] pt-0.5" style={{ color: 'var(--ink-soft)', opacity: 0.55 }}>
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className="text-[15px]" style={{ color: 'var(--ink-soft)' }}>
                      {t}
                    </span>
                  </div>
                ))}
              </div>
            </Reveal>

            <Reveal delay={110} className="md:pt-32">
              <span className="lp-label lp-label-start mb-8" style={{ color: 'var(--ink-soft)' }}>
                A single movement
              </span>
              <div className="lp-rows mt-6">
                {ANSWERS.map((t) => (
                  <div key={t} className="flex gap-5 py-5">
                    <span className="pt-0.5" style={{ color: 'var(--gold-600)' }}>
                      ·
                    </span>
                    <span className="text-[15px]" style={{ color: 'var(--ink)' }}>
                      {t}
                    </span>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        {/* --------------------------- The Mechanism ----------------------- */}
        <section id="mechanism" className="lp-dark px-5 sm:px-10 py-20 sm:py-28">
          <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-14 md:gap-20 items-start">
            <Reveal>
              <span className="lp-label lp-label-start mb-8" style={{ color: 'var(--gold-500)' }}>
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
              <span className="lp-label lp-label-start mb-8" style={{ color: 'var(--ink-soft)' }}>
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
