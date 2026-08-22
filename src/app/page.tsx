import Link from 'next/link';
import Image from 'next/image';
import { getSession } from '@/lib/auth';

/**
 * Public landing page.
 *
 * This is intentionally a different visual language from the app: white base,
 * electric blue, geometric headlines. Every class is scoped under `.lp` so the
 * app's ink-and-brass tokens are untouched, and `.lp` pins its own colours so
 * a visitor in dark mode still gets the intended design.
 *
 * The product imagery is real screenshots of the running app rather than
 * stock photography — it is the honest version and stays accurate.
 */

const Check = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="shrink-0 mt-0.5" aria-hidden>
    <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const Dash = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="shrink-0 mt-0.5" aria-hidden>
    <path d="M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
  </svg>
);

export default async function LandingPage() {
  const session = await getSession();
  const primaryHref = session ? '/dashboard' : '/register';
  const primaryLabel = session ? 'OPEN MONEY FLOW' : 'START YOUR LEDGER';

  return (
    <div className="lp relative min-h-dvh overflow-x-hidden">
      <div className="fixed inset-0 pointer-events-none lp-grid z-0" aria-hidden />

      {/* ---------------- Nav ---------------- */}
      <nav
        className="fixed top-0 inset-x-0 z-50 h-20 flex items-center justify-between px-4 md:px-20 backdrop-blur-md border-b"
        style={{ background: 'rgba(255,255,255,0.82)', borderColor: 'rgba(232,225,224,0.6)' }}
      >
        <Link href="/" className="lp-display text-2xl" style={{ color: 'var(--lp-blue-deep)' }}>
          Money&nbsp;Flow
        </Link>

        <div className="hidden md:flex items-center gap-8 text-[15px]">
          <a href="#dilemma" className="hover:opacity-70 transition-opacity" style={{ color: 'var(--lp-ink-soft)' }}>
            The Spreadsheet
          </a>
          <a href="#idea" className="hover:opacity-70 transition-opacity" style={{ color: 'var(--lp-ink-soft)' }}>
            The Idea
          </a>
          <a href="#peers" className="hover:opacity-70 transition-opacity" style={{ color: 'var(--lp-ink-soft)' }}>
            Peers
          </a>
        </div>

        <div className="flex items-center gap-3">
          {!session && (
            <Link href="/login" className="hidden sm:block text-[14px] font-semibold hover:opacity-70" style={{ color: 'var(--lp-ink-soft)' }}>
              Login
            </Link>
          )}
          <Link href={primaryHref} className="lp-btn lp-btn-primary !px-5 !py-2.5 !min-h-0 text-[13px]">
            {session ? 'Open app' : 'Get started'}
          </Link>
        </div>
      </nav>

      <main className="relative z-10 pt-24 md:pt-32">
        {/* ---------------- Hero ---------------- */}
        <section className="relative px-4 md:px-20 text-center pb-14 md:pb-24">
          <div
            className="absolute top-40 left-1/2 -translate-x-1/2 w-[min(600px,90vw)] h-[400px] rounded-full blur-[100px] -z-10"
            style={{ background: 'var(--lp-blue-soft)' }}
            aria-hidden
          />

          <span
            className="lp-label block mb-5 text-[11px] !tracking-[0.16em] sm:text-[14px] sm:!tracking-[0.2em]"
            style={{ color: 'var(--lp-ink-soft)' }}
          >
            Beyond the spreadsheet
          </span>

          <h1 className="lp-display text-[30px] leading-[1.12] sm:text-5xl md:text-[56px] max-w-4xl mx-auto mb-5">
            Know what you spent on.
            <br />
            <span style={{ color: 'var(--lp-blue)' }}>And who it was with.</span>
          </h1>

          <p className="text-[15px] sm:text-[17px] md:text-lg max-w-2xl mx-auto mb-8" style={{ color: 'var(--lp-ink-soft)', lineHeight: 1.6 }}>
            The speed of a spreadsheet, plus the one thing it could never do
            <span className="hidden sm:inline">
              {' '}
              — tracking category and person as two independent dimensions of the same expense
            </span>
            <span className="sm:hidden">: category and person, tracked separately</span>.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center items-center mb-4">
            <Link href={primaryHref} className="lp-btn lp-btn-primary lp-ambient w-full sm:w-auto">
              {primaryLabel}
            </Link>
            <a href="#idea" className="lp-btn lp-btn-secondary w-full sm:w-auto">
              SEE HOW IT WORKS
            </a>
          </div>

          <p className="text-[13px]" style={{ color: 'var(--lp-ink-soft)', opacity: 0.7 }}>
            Free and self-hosted · Import your existing sheet in one step
          </p>

          {/* Real product screenshot, not a mockup. */}
          <div className="mt-10 md:mt-20 relative w-full max-w-6xl mx-auto">
            <div
              className="relative rounded-xl overflow-hidden lp-ambient-lg border"
              style={{ borderColor: '#e8e1e0' }}
            >
              <Image
                src="/product-dashboard.png"
                alt="The Money Flow dashboard: a month total, category breakdown and per-person spending side by side."
                width={2880}
                height={1800}
                priority
                className="w-full h-auto block"
              />
            </div>

            {/* Floating stat card, per the design system's overlap rule. */}
            <div
              className="hidden sm:flex absolute -left-3 md:-left-8 top-[46%] items-center gap-3 rounded-lg border bg-white/95 backdrop-blur-sm p-3.5 shadow-lg text-left"
              style={{ borderColor: '#e8e1e0' }}
            >
              <span
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{ background: 'var(--lp-blue-soft)', color: 'var(--lp-blue)' }}
                aria-hidden
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M3 17l5-6 4 3.5L21 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <div>
                <p className="lp-label !tracking-[0.12em] text-[11px]" style={{ color: 'var(--lp-ink-soft)' }}>
                  This month
                </p>
                <p className="lp-display text-xl">₹24,962</p>
              </div>
            </div>
          </div>
        </section>

        {/* ---------------- Chaos vs clarity ---------------- */}
        <section id="dilemma" className="relative px-4 md:px-20 py-20 md:py-28">
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap pointer-events-none -z-10 w-full text-center overflow-hidden lp-watermark text-[80px] md:text-[160px]"
            aria-hidden
          >
            CHAOS VS CLARITY
          </div>

          <div className="text-center mb-14 relative z-10">
            <span className="lp-label block mb-4" style={{ color: 'var(--lp-ink-soft)' }}>
              The dilemma
            </span>
            <h2 className="lp-display text-[30px] sm:text-4xl md:text-5xl">
              Ditch <span style={{ color: 'var(--lp-blue)' }}>the spreadsheet</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-6 max-w-6xl mx-auto relative z-10 items-start">
            <div className="lp-card p-7 md:p-8" style={{ background: 'var(--lp-surface-low)' }}>
              <h3 className="lp-display text-xl mb-5" style={{ color: 'var(--lp-ink-soft)' }}>
                A month tab per sheet
              </h3>
              <ul className="space-y-3.5 text-[15px]" style={{ color: 'var(--lp-ink-soft)' }}>
                {[
                  'A column per category, and more columns for people',
                  'One dinner typed twice — and totals that quietly disagree',
                  'No way to ask “how much was Sankalp involved in?”',
                  'Every new category means restructuring the sheet',
                ].map((t) => (
                  <li key={t} className="flex items-start gap-2.5">
                    <span style={{ color: 'var(--lp-outline)' }}>
                      <Dash />
                    </span>
                    {t}
                  </li>
                ))}
              </ul>
            </div>

            <div className="lp-card lp-card-glow lp-ambient lp-overlap p-7 md:p-8 relative overflow-hidden" style={{ borderColor: 'rgba(64,86,244,0.2)' }}>
              <div
                className="absolute -top-16 -right-16 w-56 h-56 rounded-full blur-[60px] -z-10"
                style={{ background: 'var(--lp-blue-soft)' }}
                aria-hidden
              />
              <h3 className="lp-display text-xl mb-5" style={{ color: 'var(--lp-blue)' }}>
                One transaction, many views
              </h3>
              <ul className="space-y-3.5 text-[15px]">
                {[
                  'Log ₹800 once — it appears under Outside Food and under Sankalp',
                  'Category and person are independent, never added together',
                  'Add a category or a person without touching the structure',
                  'Import your existing month tabs, checked against their own totals',
                ].map((t) => (
                  <li key={t} className="flex items-start gap-2.5">
                    <span style={{ color: 'var(--lp-blue)' }}>
                      <Check />
                    </span>
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ---------------- The core idea ---------------- */}
        <section id="idea" className="relative px-4 md:px-20 py-20 md:py-28" style={{ background: 'var(--lp-surface-low)' }}>
          <div className="max-w-6xl mx-auto grid md:grid-cols-12 gap-10 md:gap-14 items-center">
            <div className="md:col-span-7">
              <span className="lp-label block mb-4" style={{ color: 'var(--lp-ink-soft)' }}>
                The idea
              </span>
              <h2 className="lp-display text-[30px] sm:text-4xl md:text-[44px] mb-6">
                Two dimensions.
                <br />
                <span style={{ color: 'var(--lp-blue)' }}>One transaction.</span>
              </h2>
              <p className="text-[16px] md:text-[17px] mb-8" style={{ color: 'var(--lp-ink-soft)', lineHeight: 1.65 }}>
                Dinner with a friend costs ₹800 once. The category tells you <em>what</em> the money went on.
                The person tells you <em>who</em> it was with. They are separate questions about the same
                ₹800 — so the app answers both without ever counting it twice.
              </p>

              <div className="lp-card p-5 md:p-6 mb-6" style={{ background: '#fff' }}>
                <div className="flex flex-wrap items-center gap-2 mb-4">
                  <span className="lp-chip">₹800</span>
                  <span className="lp-chip">Outside Food</span>
                  <span className="lp-chip">Sankalp</span>
                  <span className="lp-chip">23 Aug</span>
                </div>
                <div className="grid grid-cols-3 gap-3 text-center">
                  {[
                    ['Outside Food', '₹800'],
                    ['Sankalp', '₹800'],
                    ['Month total', '₹800'],
                  ].map(([k, v]) => (
                    <div key={k} className="py-3 rounded-lg" style={{ background: 'var(--lp-blue-soft)' }}>
                      <p className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--lp-ink-soft)' }}>
                        {k}
                      </p>
                      <p className="lp-display text-lg" style={{ color: 'var(--lp-blue-deep)' }}>
                        {v}
                      </p>
                    </div>
                  ))}
                </div>
                <p className="text-[13px] mt-4" style={{ color: 'var(--lp-ink-soft)' }}>
                  Not ₹1,600. Not ₹2,400. The same ₹800, viewed three ways.
                </p>
              </div>
            </div>

            <div className="md:col-span-5 flex justify-center">
              <div className="relative w-[248px] sm:w-[280px]">
                <div
                  className="absolute -inset-6 rounded-full blur-[60px] -z-10"
                  style={{ background: 'var(--lp-blue-soft)' }}
                  aria-hidden
                />
                <div className="rounded-[2rem] overflow-hidden border-[6px] border-[#1e1b1b] lp-ambient-lg bg-[#1e1b1b]">
                  <Image
                    src="/product-add.png"
                    alt="Adding an expense on a phone: amount, category and person in one screen."
                    width={780}
                    height={1688}
                    className="w-full h-auto block"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ---------------- Peers ---------------- */}
        <section id="peers" className="relative px-4 md:px-20 py-20 md:py-28">
          <div className="max-w-6xl mx-auto grid md:grid-cols-12 gap-10 md:gap-14 items-center">
            <div className="md:col-span-5 order-2 md:order-1 flex justify-center">
              <div className="relative w-[248px] sm:w-[280px]">
                <div className="rounded-[2rem] overflow-hidden border-[6px] border-[#1e1b1b] lp-ambient-lg bg-[#1e1b1b]">
                  <Image
                    src="/product-peers.png"
                    alt="The peers ledger: who owes you and who you owe, with a running balance."
                    width={780}
                    height={1688}
                    className="w-full h-auto block"
                  />
                </div>
              </div>
            </div>

            <div className="md:col-span-7 order-1 md:order-2">
              <span className="lp-label block mb-4" style={{ color: 'var(--lp-ink-soft)' }}>
                Peers
              </span>
              <h2 className="lp-display text-[30px] sm:text-4xl md:text-[44px] mb-6">
                Lending isn&apos;t <span style={{ color: 'var(--lp-blue)' }}>spending.</span>
              </h2>
              <p className="text-[16px] md:text-[17px] mb-7" style={{ color: 'var(--lp-ink-soft)', lineHeight: 1.65 }}>
                Money you lend comes back, so counting it as an expense would quietly inflate every total you
                look at. Peers keeps a separate ledger: what you gave, what you got, and the running balance
                with each person — never mixed into your spending.
              </p>
              <ul className="space-y-3.5 text-[15px]">
                {[
                  'Given and taken, netted into one balance per person',
                  'Every sub-transaction kept, with the balance after it',
                  'Settle up in one tap when the balance clears',
                ].map((t) => (
                  <li key={t} className="flex items-start gap-2.5" style={{ color: 'var(--lp-ink)' }}>
                    <span style={{ color: 'var(--lp-blue)' }}>
                      <Check />
                    </span>
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ---------------- Close ---------------- */}
        <section className="relative px-4 md:px-20 pb-20 md:pb-28">
          <div
            className="max-w-5xl mx-auto rounded-2xl px-6 py-14 md:py-20 text-center relative overflow-hidden lp-ambient-lg"
            style={{ background: 'var(--lp-blue)' }}
          >
            <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-white/10 blur-[60px]" aria-hidden />
            <h2 className="lp-display text-[28px] sm:text-4xl text-white mb-4">Precision in every entry.</h2>
            <p className="text-white/80 max-w-xl mx-auto mb-8 text-[16px]">
              Bring your months across from the sheet and keep logging in seconds.
            </p>
            <Link
              href={primaryHref}
              className="lp-btn"
              style={{ background: '#fff', color: 'var(--lp-blue-deep)' }}
            >
              {primaryLabel}
            </Link>
          </div>
        </section>
      </main>

      <footer
        className="relative z-20 border-t px-4 md:px-20 py-10 flex flex-col md:flex-row items-center justify-between gap-5"
        style={{ borderColor: '#f0ebea' }}
      >
        <span className="lp-display text-xl">Money Flow</span>
        <div className="flex gap-6 text-[14px]" style={{ color: 'var(--lp-ink-soft)' }}>
          <Link href="/login" className="hover:opacity-70">
            Login
          </Link>
          <Link href="/register" className="hover:opacity-70">
            Create account
          </Link>
          <a href="https://github.com/siddharttth/money-flow" className="hover:opacity-70" target="_blank" rel="noreferrer">
            Source
          </a>
        </div>
        <span className="text-[13px]" style={{ color: 'var(--lp-ink-soft)', opacity: 0.7 }}>
          © {new Date().getFullYear()} Money Flow · Precision in every entry.
        </span>
      </footer>
    </div>
  );
}
