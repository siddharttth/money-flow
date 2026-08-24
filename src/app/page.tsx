import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { Reveal } from '@/components/lp-reveal';
import { AddMockup, DashboardMockup, PeersMockup, PeopleStrip } from '@/components/lp-mockups';

/**
 * Public landing page — "Rolex boutique meets liquid glass".
 *
 * Deep bottle-green lacquer, gilt used sparingly, frosted panels with a real
 * specular edge. Every class is scoped under `.lp` so none of it reaches the
 * app, and `.lp` pins its own colours so the design holds in either OS theme.
 *
 * The product previews are live markup rather than screenshots: the brief asks
 * for them to carry the same glass and gold treatment, which a raster image
 * cannot. The figures in them are the app's real values.
 */

const Rule = () => <div className="lp-hairline lp-draw" aria-hidden />;

export default async function LandingPage() {
  const session = await getSession();
  const href = session ? '/dashboard' : '/register';
  const cta = session ? 'Enter Money Flow' : 'Begin your ledger';

  return (
    <div className="lp relative min-h-dvh overflow-x-hidden">
      {/* Reveal animations are JS-driven; without JS the sections would stay
          at opacity 0, so unhide them outright. */}
      <noscript>
        <style>{`.lp-reveal{opacity:1 !important;transform:none !important}.lp-draw{transform:none !important}`}</style>
      </noscript>
      {/* ------------------------------ Nav ------------------------------ */}
      <nav className="fixed top-3 sm:top-5 inset-x-3 sm:inset-x-6 z-50 flex justify-center">
        <div className="glass-panel !rounded-full w-full max-w-5xl flex items-center justify-between gap-4 pl-5 pr-2 py-2">
          <Link href="/" className="lp-display text-lg sm:text-xl tracking-tight" style={{ color: 'var(--ivory-100)' }}>
            Money <span className="lp-display-light lp-gold">Flow</span>
          </Link>

          <div className="hidden md:flex items-center gap-7 text-[12px]" style={{ color: 'var(--ivory-300)' }}>
            <a href="#dilemma" className="hover:text-[var(--gold-400)] transition-colors" style={{ transitionDuration: '600ms' }}>
              The Movement
            </a>
            <a href="#idea" className="hover:text-[var(--gold-400)] transition-colors" style={{ transitionDuration: '600ms' }}>
              The Mechanism
            </a>
            <a href="#peers" className="hover:text-[var(--gold-400)] transition-colors" style={{ transitionDuration: '600ms' }}>
              The Ledger
            </a>
          </div>

          <div className="flex items-center gap-2">
            {!session && (
              <Link
                href="/login"
                className="hidden sm:block text-[11px] tracking-[0.14em] uppercase px-3"
                style={{ color: 'var(--ivory-300)' }}
              >
                Sign in
              </Link>
            )}
            <Link href={href} className="lp-btn lp-btn-gold !px-5 !py-2.5 !min-h-0 !text-[10.5px]">
              {session ? 'Enter' : 'Get started'}
            </Link>
          </div>
        </div>
      </nav>

      <main className="relative z-10 pt-28 sm:pt-40">
        {/* ------------------------------ Hero ----------------------------- */}
        <section className="px-5 sm:px-8 text-center pb-14 sm:pb-24">
          <Reveal>
            <span className="lp-label lp-label-center mb-7">A new standard in personal ledgers</span>
          </Reveal>

          <Reveal delay={80}>
            <h1 className="lp-display text-[2rem] leading-[1.1] sm:text-6xl md:text-[4.6rem] max-w-4xl mx-auto mb-6">
              Every rupee, accounted for.
              <br />
              <span className="lp-display-light lp-gold">Every relationship, remembered.</span>
            </h1>
          </Reveal>

          <Reveal delay={160}>
            <p
              className="text-[14.5px] sm:text-[17px] max-w-xl mx-auto mb-9 leading-relaxed"
              style={{ color: 'var(--ivory-300)' }}
            >
              Built with the discipline of a ledger and the ease of nothing at all. What you spent on and
              who you spent it with, kept as two separate truths about a single entry.
            </p>
          </Reveal>

          <Reveal delay={240}>
            <div className="flex flex-col sm:flex-row gap-3 justify-center items-center mb-5">
              <Link href={href} className="lp-btn lp-btn-gold w-full sm:w-auto">
                {cta}
              </Link>
              <a href="#idea" className="lp-btn lp-btn-outline w-full sm:w-auto">
                Discover the mechanism
              </a>
            </div>
            <p className="text-[11px] tracking-[0.12em] uppercase" style={{ color: 'var(--ivory-300)', opacity: 0.62 }}>
              Self-hosted · Your sheet imported in a single pass
            </p>
          </Reveal>

          <Reveal delay={320} className="mt-14 sm:mt-20">
            <div className="max-w-5xl mx-auto">
              <DashboardMockup />
            </div>
          </Reveal>
        </section>

        {/* ---------------------------- The Dilemma ------------------------ */}
        <section id="dilemma" className="px-5 sm:px-8 py-16 sm:py-28">
          <Reveal className="text-center mb-12 sm:mb-16">
            <span className="lp-label lp-label-center mb-6">The complication</span>
            <h2 className="lp-display text-[1.9rem] sm:text-4xl md:text-5xl max-w-3xl mx-auto">
              The spreadsheet was never
              <span className="lp-display-light lp-gold"> built for this.</span>
            </h2>
          </Reveal>

          <div className="grid md:grid-cols-2 gap-5 max-w-5xl mx-auto items-start">
            <Reveal>
              <div className="glass-panel glass-muted glass-lift p-7 sm:p-8">
                <span className="lp-label mb-6">A column for everything</span>
                <ul className="space-y-4 text-[14.5px] mt-6" style={{ color: 'var(--ivory-300)' }}>
                  {[
                    'One column per category, then more columns for people.',
                    'A single dinner entered twice — and totals that quietly disagree.',
                    'No way to ask what a friendship actually cost you.',
                    'Every new category means rebuilding the sheet.',
                  ].map((t) => (
                    <li key={t} className="flex gap-3">
                      <span style={{ color: 'var(--gold-700)' }}>—</span>
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>

            <Reveal delay={120}>
              <div className="glass-panel glass-gold glass-lift p-7 sm:p-8 md:-translate-y-6">
                <span className="lp-label mb-6">A single movement</span>
                <ul className="space-y-4 text-[14.5px] mt-6" style={{ color: 'var(--ivory-100)' }}>
                  {[
                    'Enter ₹800 once. It appears under Outside Food and under Sankalp.',
                    'Category and person are independent, never summed together.',
                    'Add a person or a category without touching the structure.',
                    'Your existing month tabs imported, checked against their own totals.',
                  ].map((t) => (
                    <li key={t} className="flex gap-3">
                      <span className="lp-gold">·</span>
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ----------------------------- The Idea -------------------------- */}
        <section id="idea" className="px-5 sm:px-8 py-16 sm:py-28">
          <div className="max-w-6xl mx-auto grid md:grid-cols-12 gap-12 md:gap-16 items-center">
            <Reveal className="md:col-span-7">
              <span className="lp-label mb-6">The mechanism</span>
              <h2 className="lp-display text-[1.9rem] sm:text-4xl md:text-[3.1rem] mb-7 mt-5">
                Two dimensions.
                <br />
                <span className="lp-display-light lp-gold">One transaction.</span>
              </h2>
              <p className="text-[15px] sm:text-[16.5px] mb-8 leading-relaxed" style={{ color: 'var(--ivory-300)' }}>
                Dinner with a friend costs ₹800 once. The category records what the money became. The person
                records who it was for. Two separate questions about the same entry — answered without ever
                counting it twice.
              </p>

              <div className="glass-panel p-5 sm:p-6">
                <div className="flex flex-wrap items-center gap-2 mb-5">
                  {['₹800', 'Outside Food', 'Sankalp', '23 Aug'].map((c, i) => (
                    <span key={c} className={`lp-chip ${i === 0 ? 'lp-num' : ''}`}>
                      {c}
                    </span>
                  ))}
                </div>
                <Rule />
                <div className="grid grid-cols-3 gap-3 sm:gap-4 mt-5 text-center">
                  {[
                    ['Outside Food', '₹800'],
                    ['Sankalp', '₹800'],
                    ['August total', '₹800'],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <p className="text-[9px] tracking-[0.13em] uppercase mb-1.5" style={{ color: 'var(--ivory-300)', opacity: 0.75 }}>
                        {k}
                      </p>
                      <p className="lp-num lp-gold text-lg sm:text-xl">{v}</p>
                    </div>
                  ))}
                </div>
                <p className="text-[12.5px] mt-5" style={{ color: 'var(--ivory-300)', opacity: 0.8 }}>
                  Not ₹1,600. Not ₹2,400. The same ₹800, read three ways.
                </p>
              </div>
            </Reveal>

            <Reveal delay={140} className="md:col-span-5">
              <div className="flex justify-center">
                <AddMockup />
              </div>
            </Reveal>
          </div>
        </section>

        {/* ------------------------------ Peers ---------------------------- */}
        <section id="peers" className="px-5 sm:px-8 py-16 sm:py-28">
          <div className="max-w-6xl mx-auto grid md:grid-cols-12 gap-12 md:gap-16 items-center">
            <Reveal className="md:col-span-5 order-2 md:order-1">
              <div className="flex justify-center">
                <PeersMockup />
              </div>
            </Reveal>

            <Reveal delay={140} className="md:col-span-7 order-1 md:order-2">
              <span className="lp-label mb-6">The ledger</span>
              <h2 className="lp-display text-[1.9rem] sm:text-4xl md:text-[3.1rem] mb-7 mt-5">
                Lending isn&apos;t
                <span className="lp-display-light lp-gold"> spending.</span>
              </h2>
              <p className="text-[15px] sm:text-[16.5px] mb-8 leading-relaxed" style={{ color: 'var(--ivory-300)' }}>
                Money lent comes back. Counted as an expense, it would quietly inflate every figure you rely
                on. So it is kept apart — what you gave, what you received, and the standing balance with each
                person, never mixed into what you actually spent.
              </p>

              <div className="space-y-4">
                {[
                  'Given and received, netted into one balance per person.',
                  'Every movement preserved, with the balance that followed it.',
                  'Settled in a single gesture when the account clears.',
                ].map((t) => (
                  <div key={t}>
                    <div className="flex gap-3 text-[14.5px] pb-4" style={{ color: 'var(--ivory-100)' }}>
                      <span className="lp-gold">·</span>
                      {t}
                    </div>
                    <Rule />
                  </div>
                ))}
              </div>

              <div className="mt-8 max-w-[15rem]">
                <PeopleStrip />
              </div>
            </Reveal>
          </div>
        </section>

        {/* --------------------------- Closing band ------------------------ */}
        <section className="mt-8">
          <Reveal>
            <div className="lp-hairline" />
            <div className="px-5 sm:px-8 py-20 sm:py-28 text-center" style={{ background: 'rgba(0, 25, 15, 0.35)' }}>
              <h2 className="lp-display text-[2rem] sm:text-5xl mb-5">
                Precision in
                <span className="lp-display-light lp-gold"> every entry.</span>
              </h2>
              <p className="text-[15px] max-w-lg mx-auto mb-9" style={{ color: 'var(--ivory-300)' }}>
                Bring your months across from the sheet, and keep the habit that took you years to build.
              </p>
              <Link href={href} className="lp-btn lp-btn-gold">
                {cta}
              </Link>
            </div>
            <div className="lp-hairline" />
          </Reveal>
        </section>
      </main>

      <footer className="relative z-10 px-5 sm:px-8 py-10 flex flex-col sm:flex-row items-center justify-between gap-5">
        <span className="lp-display text-lg" style={{ color: 'var(--ivory-100)' }}>
          Money <span className="lp-display-light lp-gold">Flow</span>
        </span>
        <div className="flex gap-7 text-[12px]" style={{ color: 'var(--ivory-300)' }}>
          <Link href="/login" className="hover:text-[var(--gold-400)]">
            Sign in
          </Link>
          <Link href="/register" className="hover:text-[var(--gold-400)]">
            Create account
          </Link>
          <a href="https://github.com/siddharttth/money-flow" target="_blank" rel="noreferrer" className="hover:text-[var(--gold-400)]">
            Source
          </a>
        </div>
        <span className="text-[11px] tracking-[0.1em] uppercase" style={{ color: 'var(--ivory-300)', opacity: 0.55 }}>
          © {new Date().getFullYear()} Money Flow
        </span>
      </footer>
    </div>
  );
}
