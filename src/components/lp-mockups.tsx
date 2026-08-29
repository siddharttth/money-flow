import { CountUp } from './lp-countup';

/**
 * Product panels for the landing page — flat, hairline-bordered surfaces
 * rather than device frames. Every figure is a real value from the app.
 */

const CATEGORIES: [string, number][] = [
  ['Investment', 10000],
  ['Shopping', 4843],
  ['Outside Food', 2921],
  ['Misc', 2140],
  ['Ciggs / Alc', 1931],
];

const PEOPLE: [string, string][] = [
  ['Me', '13,480'],
  ['Sankalp', '3,764'],
  ['Mummy', '2,208'],
  ['Aarya', '2,160'],
];

const TICKER = [
  ['Sankalp', '3,764'],
  ['Mummy', '2,208'],
  ['Aarya', '2,160'],
  ['Investment', '10,000'],
  ['Shopping', '4,843'],
  ['Outside Food', '2,921'],
  ['Misc', '2,140'],
  ['Ciggs / Alc', '1,931'],
  ['Me', '13,480'],
];

function Initial({ name, size = 22 }: { name: string; size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center shrink-0 rounded-full"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.45),
        color: 'var(--gold-400)',
        border: '1px solid rgba(201,169,106,0.4)',
      }}
      aria-hidden
    >
      {name.trim()[0]?.toUpperCase()}
    </span>
  );
}

/** Scrolling strip of real figures, between the hero and the product. */
export function Ticker() {
  const run = [...TICKER, ...TICKER];
  return (
    <div
      className="lp-ticker border-y py-3"
      style={{ borderColor: 'color-mix(in oklab, var(--onforest) 10%, transparent)' }}
    >
      {/* Duplicated so the -50% loop is seamless. */}
      <div
        className="lp-ticker-track w-max gap-10 font-mono text-[11px] uppercase tracking-[0.25em]"
        style={{ color: 'var(--onforest-muted)' }}
      >
        {run.map(([name, amount], i) => (
          <span key={i} className="flex shrink-0 items-center gap-10">
            {name} ₹{amount}
            <span style={{ color: 'var(--gold)' }}>·</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function DashboardPanel() {
  const max = Math.max(...CATEGORIES.map((c) => c[1]));

  return (
    <div
      className="overflow-hidden rounded-lg border"
      style={{
        borderColor: 'color-mix(in oklab, var(--onforest) 10%, transparent)',
        background: 'var(--forest-ink)',
        boxShadow: '0 60px 120px -40px color-mix(in oklab, var(--forest-ink) 70%, transparent)',
      }}
    >
      <div className="grid md:grid-cols-[180px_1fr]">
        <aside
          className="hidden border-r p-5 md:block"
          style={{ borderColor: 'color-mix(in oklab, var(--onforest) 10%, transparent)' }}
        >
          <span className="lp-display text-[21px]" style={{ color: 'var(--onforest)' }}>
            Money{' '}
            <span className="lp-display-em" style={{ color: 'var(--gold-soft)' }}>
              Flow
            </span>
          </span>
          <nav className="mt-8 space-y-1 text-[13px]">
            {['Dashboard', 'Transactions', 'People', 'Analytics', 'Settings'].map((item, i) => (
              <div
                key={item}
                className={`rounded px-3 py-2 ${i === 0 ? '' : 'lp-hoverable'}`}
                style={
                  i === 0
                    ? { background: 'color-mix(in oklab, var(--onforest) 10%, transparent)', color: 'var(--onforest)' }
                    : { color: 'var(--onforest-muted)' }
                }
              >
                {item}
              </div>
            ))}
          </nav>
        </aside>

        <div className="p-6 md:p-8">
          <p className="lp-eyebrow" style={{ color: 'var(--onforest-muted)' }}>
            Total spending
          </p>
          <p className="lp-display mt-2 text-5xl" style={{ color: 'var(--gold-soft)' }}>
            <CountUp to={24962} />
          </p>
          <p className="mt-1 text-[13px]" style={{ color: 'var(--onforest-muted)' }}>
            25 transactions · August 2026
          </p>

          <div className="mt-6 grid grid-cols-3 gap-3">
            {[
              ['Today', '₹2,300'],
              ['This week', '₹5,438'],
              ['Daily pace', '₹1,085'],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded border px-3 py-4"
                style={{
                  borderColor: 'color-mix(in oklab, var(--onforest) 10%, transparent)',
                  background: 'color-mix(in oklab, var(--onforest) 4%, transparent)',
                }}
              >
                <p className="lp-eyebrow text-[9px]" style={{ color: 'var(--onforest-muted)' }}>
                  {label}
                </p>
                <p className="lp-display mt-1 text-lg md:text-xl" style={{ color: 'var(--onforest)' }}>
                  {value}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <div>
              <p className="lp-eyebrow text-[9px]" style={{ color: 'var(--onforest-muted)' }}>
                Where it went
              </p>
              <div className="mt-3 space-y-3">
                {CATEGORIES.map(([name, amt], i) => (
                  <div key={name}>
                    <div className="flex justify-between text-[13px]">
                      <span style={{ color: 'var(--onforest)' }}>{name}</span>
                      <span className="lp-tab" style={{ color: 'var(--onforest-muted)' }}>
                        ₹{amt.toLocaleString('en-IN')}
                      </span>
                    </div>
                    {/* One gold, fading down the list — not a colour per category. */}
                    <div
                      className="mt-1 h-1 rounded-full"
                      style={{ background: 'color-mix(in oklab, var(--onforest) 10%, transparent)' }}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${(amt / max) * 100}%`, background: 'var(--gold)', opacity: 1 - i * 0.14 }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="lp-eyebrow text-[9px]" style={{ color: 'var(--onforest-muted)' }}>
                Who it was with
              </p>
              <div className="mt-3 space-y-1">
                {PEOPLE.map(([name, amount]) => (
                  <div
                    key={name}
                    className="flex items-center justify-between border-b py-2 text-[13px] last:border-0"
                    style={{ borderColor: 'color-mix(in oklab, var(--onforest) 10%, transparent)' }}
                  >
                    <span className="flex items-center gap-3" style={{ color: 'var(--onforest)' }}>
                      <span
                        className="flex h-6 w-6 items-center justify-center rounded-full border font-mono text-[10px]"
                        style={{
                          borderColor: 'color-mix(in oklab, var(--onforest) 20%, transparent)',
                          color: 'var(--gold-soft)',
                        }}
                      >
                        {name[0]}
                      </span>
                      {name}
                    </span>
                    <span className="lp-tab" style={{ color: 'var(--onforest-muted)' }}>
                      ₹{amount}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The single-entry card, its three readings, and the add sheet. */
export function MechanismPanels() {
  const hair = 'color-mix(in oklab, var(--onforest) 10%, transparent)';
  const wash = 'color-mix(in oklab, var(--onforest) 4%, transparent)';

  return (
    <div className="relative">
      {/* The entry sits on the darkest green, so it reads as the subject. */}
      <div className="rounded-lg border p-6" style={{ borderColor: hair, background: 'var(--forest-ink)' }}>
        <div className="flex items-baseline justify-between">
          <p className="lp-display lp-tab text-4xl" style={{ color: 'var(--gold-soft)' }}>
            ₹800
          </p>
          <p className="font-mono text-[11px]" style={{ color: 'var(--onforest-muted)' }}>
            23 Aug
          </p>
        </div>
        <div className="mt-4 space-y-2 text-[13px]">
          <div className="flex items-center justify-between border-b pb-2" style={{ borderColor: hair }}>
            <span className="lp-eyebrow text-[9px]" style={{ color: 'var(--onforest-muted)' }}>
              Category
            </span>
            <span style={{ color: 'var(--onforest)' }}>Outside Food</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="lp-eyebrow text-[9px]" style={{ color: 'var(--onforest-muted)' }}>
              With
            </span>
            <span style={{ color: 'var(--onforest)' }}>Sankalp</span>
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-3">
        {[
          ['Outside Food', '₹800'],
          ['Sankalp', '₹800'],
          ['August total', '₹800'],
        ].map(([label, value]) => (
          <div key={label} className="rounded border px-3 py-4 text-center" style={{ borderColor: hair, background: wash }}>
            <p className="lp-eyebrow text-[8px]" style={{ color: 'var(--onforest-muted)' }}>
              {label}
            </p>
            <p className="lp-display lp-tab mt-3 text-lg" style={{ color: 'var(--gold-soft)' }}>
              {value}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-3 rounded-lg border p-5" style={{ borderColor: hair, background: wash }}>
        <div className="flex items-center justify-between">
          <p className="text-[13px] font-medium" style={{ color: 'var(--onforest)' }}>
            Add transaction
          </p>
          <span style={{ color: 'var(--onforest-muted)' }}>×</span>
        </div>

        <div className="mt-4 flex gap-2 text-[11px]">
          {['Expense', 'I lent', 'I borrowed'].map((tab, i) => (
            <span
              key={tab}
              className="rounded-full border px-3 py-1"
              style={
                i === 0
                  ? {
                      borderColor: 'color-mix(in oklab, var(--gold) 60%, transparent)',
                      background: 'color-mix(in oklab, var(--gold) 15%, transparent)',
                      color: 'var(--gold-soft)',
                    }
                  : { borderColor: 'color-mix(in oklab, var(--onforest) 15%, transparent)', color: 'var(--onforest-muted)' }
              }
            >
              {tab}
            </span>
          ))}
        </div>

        <div className="mt-4">
          <p className="lp-eyebrow text-[9px]" style={{ color: 'var(--onforest-muted)' }}>
            Amount
          </p>
          <p className="lp-display lp-tab mt-1 text-2xl" style={{ color: 'var(--onforest)' }}>
            ₹350
            <span className="lp-caret" aria-hidden />
          </p>
        </div>

        <div className="mt-4">
          <p className="lp-eyebrow text-[9px]" style={{ color: 'var(--onforest-muted)' }}>
            Category
          </p>
          <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
            {['Outside Food', 'Transport', 'Shopping', 'Bills'].map((c, i) => (
              <span
                key={c}
                className="rounded-full border px-3 py-1"
                style={
                  i === 0
                    ? {
                        borderColor: 'color-mix(in oklab, var(--gold) 60%, transparent)',
                        background: 'color-mix(in oklab, var(--gold) 15%, transparent)',
                        color: 'var(--gold-soft)',
                      }
                    : { borderColor: 'color-mix(in oklab, var(--onforest) 15%, transparent)', color: 'var(--onforest-muted)' }
                }
              >
                {c}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <p className="lp-eyebrow text-[9px]" style={{ color: 'var(--onforest-muted)' }}>
            With
          </p>
          <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
            {['Sankalp', 'Me', 'Mummy'].map((n, i) => (
              <span
                key={n}
                className="flex items-center gap-2 rounded-full border px-3 py-1"
                style={
                  i === 0
                    ? {
                        borderColor: 'color-mix(in oklab, var(--gold) 60%, transparent)',
                        background: 'color-mix(in oklab, var(--gold) 15%, transparent)',
                        color: 'var(--gold-soft)',
                      }
                    : { borderColor: 'color-mix(in oklab, var(--onforest) 15%, transparent)', color: 'var(--onforest-muted)' }
                }
              >
                <Initial name={n} size={16} />
                {n}
              </span>
            ))}
          </div>
        </div>

        <div
          className="mt-5 rounded py-3 text-center text-[11px] uppercase tracking-[0.2em] font-semibold"
          style={{ background: 'var(--gold)', color: 'var(--forest-deep)' }}
        >
          Save
        </div>
      </div>
    </div>
  );
}

export function LedgerPanel() {
  return (
    <div className="lp-panel p-4 sm:p-5">
      <div className="lp-panel-deep p-5">
        <p className="text-[9.5px] tracking-[0.2em] uppercase mb-4" style={{ color: 'var(--ivory-300)', opacity: 0.7 }}>
          People &amp; Ledger
        </p>

        <div className="grid grid-cols-3 gap-3">
          {[
            ['They owe me', '₹4,000', 'var(--ivory-100)'],
            ['I owe', '₹13,950', 'var(--ivory-100)'],
            ['Net position', '−₹9,950', 'var(--gold-500)'],
          ].map(([k, v, c]) => (
            <div key={k} className="lp-panel px-3 py-3">
              <p className="text-[8.5px] tracking-[0.16em] uppercase leading-relaxed" style={{ color: 'var(--ivory-300)', opacity: 0.7 }}>
                {k}
              </p>
              <p className="lp-num text-[16px] mt-1.5" style={{ color: c }}>
                {v}
              </p>
            </div>
          ))}
        </div>

        <div className="lp-rows mt-5">
          {[
            ['Mummy', '+₹2,500'],
            ['Sankalp', '+₹1,000'],
            ['Aarya', '+₹500'],
            ['Aditi', '−₹13,950'],
          ].map(([name, amount]) => (
            <div key={name} className="flex items-center gap-3 py-3">
              <Initial name={name} />
              <span className="text-[12.5px] flex-1" style={{ color: 'var(--ivory-100)' }}>
                {name}
              </span>
              <span
                className="lp-mono text-[12px]"
                style={{ color: amount.startsWith('−') ? 'var(--gold-500)' : 'var(--ivory-100)' }}
              >
                {amount}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
