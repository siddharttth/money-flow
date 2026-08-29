import { Icon, type IconKey } from './icons';

/**
 * Product panels for the landing page — flat, hairline-bordered surfaces
 * rather than device frames. Every figure is a real value from the app.
 */

const CATEGORIES: [string, string, IconKey, string, number][] = [
  ['Investment', '10,000', 'invest', 'var(--gold-500)', 100],
  ['Shopping', '4,843', 'shop', '#9ec2ad', 48],
  ['Outside Food', '2,921', 'food', '#c98a5e', 29],
  ['Misc', '2,140', 'misc', '#8aa79a', 21],
  ['Ciggs / Alc', '1,931', 'smoke', '#b5786a', 19],
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
    <section className="py-16 sm:py-20" style={{ background: 'var(--forest)' }}>
      <div
        className="lp-ticker border-y py-3"
        style={{ borderColor: 'color-mix(in oklab, var(--onforest) 10%, transparent)' }}
      >
        {/* Duplicated so the -50% loop is seamless. */}
        <div className="lp-ticker-track w-max gap-10 font-mono text-[11px] uppercase tracking-[0.25em]" style={{ color: 'var(--onforest-muted)' }}>
          {run.map(([name, amount], i) => (
            <span key={i} className="flex items-center gap-10 shrink-0">
              <span>
                {name}{' '}
                <span className="lp-mono" style={{ color: 'var(--gold-soft)' }}>
                  ₹{amount}
                </span>
              </span>
              <span className="opacity-40">·</span>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

export function DashboardPanel() {
  return (
    <div className="lp-panel overflow-hidden">
      <div className="grid grid-cols-1 sm:grid-cols-[168px_1fr]">
        <div className="hidden sm:flex flex-col gap-0.5 p-5 border-r" style={{ borderColor: 'rgba(243,239,228,0.09)' }}>
          <span className="lp-display text-[15px] mb-5">
            Money <span className="lp-display-em" style={{ color: 'var(--gold-500)' }}>Flow</span>
          </span>
          {['Dashboard', 'Transactions', 'People', 'Analytics', 'Settings'].map((n, i) => (
            <span
              key={n}
              className="text-[12px] px-3 py-2 rounded-[3px]"
              style={{
                color: i === 0 ? 'var(--ivory-100)' : 'var(--ivory-300)',
                background: i === 0 ? 'rgba(243,239,228,0.07)' : 'transparent',
                opacity: i === 0 ? 1 : 0.62,
              }}
            >
              {n}
            </span>
          ))}
        </div>

        <div className="p-5 sm:p-7">
          <p className="text-[10px] tracking-[0.2em] uppercase" style={{ color: 'var(--ivory-300)', opacity: 0.7 }}>
            Total spending
          </p>
          <p className="lp-num text-[38px] sm:text-[46px] leading-none mt-2" style={{ color: 'var(--gold-500)' }}>
            ₹24,962
          </p>
          <p className="text-[12px] mt-2.5" style={{ color: 'var(--ivory-300)', opacity: 0.75 }}>
            25 transactions · August 2026
          </p>

          <div className="grid grid-cols-3 gap-3 mt-6">
            {[
              ['Today', '2,300'],
              ['This week', '5,438'],
              ['Daily pace', '1,085'],
            ].map(([label, value]) => (
              <div key={label} className="lp-panel-deep px-3.5 py-3">
                <p className="text-[9px] tracking-[0.18em] uppercase" style={{ color: 'var(--ivory-300)', opacity: 0.7 }}>
                  {label}
                </p>
                <p className="lp-num text-[19px] mt-1.5" style={{ color: 'var(--ivory-100)' }}>
                  ₹{value}
                </p>
              </div>
            ))}
          </div>

          <div className="grid md:grid-cols-2 gap-7 mt-7">
            <div>
              <p className="text-[9.5px] tracking-[0.2em] uppercase mb-3.5" style={{ color: 'var(--ivory-300)', opacity: 0.7 }}>
                Where it went
              </p>
              <div className="space-y-3">
                {CATEGORIES.map(([name, amount, icon, color, width]) => (
                  <div key={name}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span style={{ color }} className="shrink-0 flex opacity-80">
                        <Icon name={icon} size={12} />
                      </span>
                      <span className="text-[12px] flex-1 truncate" style={{ color: 'var(--ivory-100)' }}>
                        {name}
                      </span>
                      <span className="lp-mono text-[11.5px]" style={{ color: 'var(--ivory-100)' }}>
                        ₹{amount}
                      </span>
                    </div>
                    <div className="h-[3px] rounded-full" style={{ background: 'rgba(243,239,228,0.08)' }}>
                      <div className="h-full rounded-full" style={{ width: `${width}%`, background: color }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[9.5px] tracking-[0.2em] uppercase mb-3.5" style={{ color: 'var(--ivory-300)', opacity: 0.7 }}>
                Who it was with
              </p>
              <div className="lp-rows">
                {PEOPLE.map(([name, amount]) => (
                  <div key={name} className="flex items-center gap-3 py-2.5">
                    <Initial name={name} />
                    <span className="text-[12px] flex-1 truncate" style={{ color: 'var(--ivory-100)' }}>
                      {name}
                    </span>
                    <span className="lp-mono text-[11.5px]" style={{ color: 'var(--ivory-100)' }}>
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
  return (
    <div className="space-y-3">
      <div className="lp-panel-deep p-5">
        <div className="flex items-start justify-between gap-4">
          <span className="lp-num text-[30px] leading-none" style={{ color: 'var(--gold-500)' }}>
            ₹800
          </span>
          <span className="lp-mono text-[11px] mt-1.5" style={{ color: 'var(--ivory-300)', opacity: 0.8 }}>
            23 Aug
          </span>
        </div>
        <div className="lp-rows mt-4">
          {[
            ['Category', 'Outside Food'],
            ['With', 'Sankalp'],
          ].map(([k, v]) => (
            <div key={k} className="flex items-center justify-between py-2.5">
              <span className="text-[9.5px] tracking-[0.2em] uppercase" style={{ color: 'var(--ivory-300)', opacity: 0.7 }}>
                {k}
              </span>
              <span className="text-[13px]" style={{ color: 'var(--ivory-100)' }}>
                {v}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          ['Outside Food', '₹800'],
          ['Sankalp', '₹800'],
          ['August total', '₹800'],
        ].map(([k, v]) => (
          <div key={k} className="lp-panel px-3 py-3.5 text-center">
            <p className="text-[8.5px] tracking-[0.16em] uppercase" style={{ color: 'var(--ivory-300)', opacity: 0.7 }}>
              {k}
            </p>
            <p className="lp-num text-[17px] mt-1.5" style={{ color: 'var(--gold-500)' }}>
              {v}
            </p>
          </div>
        ))}
      </div>

      <div className="lp-panel p-5">
        <div className="flex items-center justify-between mb-4">
          <span className="text-[13px]" style={{ color: 'var(--ivory-100)' }}>
            Add transaction
          </span>
          <span style={{ color: 'var(--ivory-300)', opacity: 0.6 }}>×</span>
        </div>

        <div className="flex gap-2 mb-5">
          <span className="lp-chip lp-chip-on">Expense</span>
          <span className="lp-chip">I lent</span>
          <span className="lp-chip">I borrowed</span>
        </div>

        <p className="text-[9px] tracking-[0.2em] uppercase mb-1.5" style={{ color: 'var(--ivory-300)', opacity: 0.7 }}>
          Amount
        </p>
        <p className="lp-num text-[26px] mb-5" style={{ color: 'var(--ivory-100)' }}>
          ₹350
          <span className="lp-caret" aria-hidden />
        </p>

        <p className="text-[9px] tracking-[0.2em] uppercase mb-2" style={{ color: 'var(--ivory-300)', opacity: 0.7 }}>
          Category
        </p>
        <div className="flex flex-wrap gap-2 mb-5">
          <span className="lp-chip lp-chip-on">Outside Food</span>
          <span className="lp-chip">Transport</span>
          <span className="lp-chip">Shopping</span>
          <span className="lp-chip">Bills</span>
        </div>

        <p className="text-[9px] tracking-[0.2em] uppercase mb-2" style={{ color: 'var(--ivory-300)', opacity: 0.7 }}>
          With
        </p>
        <div className="flex flex-wrap gap-2 mb-6">
          <span className="lp-chip lp-chip-on">
            <Initial name="Sankalp" size={15} /> Sankalp
          </span>
          <span className="lp-chip">
            <Initial name="Me" size={15} /> Me
          </span>
          <span className="lp-chip">
            <Initial name="Mummy" size={15} /> Mummy
          </span>
        </div>

        <div
          className="text-[10px] tracking-[0.2em] uppercase text-center py-3.5 rounded-[2px]"
          style={{ background: 'var(--gold-500)', color: '#23180a' }}
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
