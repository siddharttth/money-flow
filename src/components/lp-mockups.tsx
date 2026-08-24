/**
 * Live mockups of the product, rendered as markup rather than screenshots.
 *
 * The brief asks for the preview screens to carry the same glass material and
 * gold numerals as the marketing chrome — which a raster screenshot cannot do.
 * The figures below are the real values from the running app, so the previews
 * stay honest while matching the surrounding design.
 */

const CATEGORIES = [
  ['Investment', '10,000', '#c9a96a', 100],
  ['Shopping', '4,843', '#8fbfa4', 48],
  ['Outside Food', '2,921', '#c2703f', 29],
  ['Misc', '2,140', '#7f9a8c', 21],
  ['Ciggs / Alc', '1,931', '#a8564a', 19],
] as const;

const PEOPLE = [
  ['Me', '13,480'],
  ['Sankalp', '3,764'],
  ['Mummy', '2,208'],
  ['Aarya', '2,160'],
] as const;

function Stat({ label, value, gold = false }: { label: string; value: string; gold?: boolean }) {
  return (
    <div className="glass-panel !rounded-xl px-3 py-2.5">
      <p className="text-[8px] tracking-[0.16em] uppercase" style={{ color: 'var(--ivory-300)', opacity: 0.75 }}>
        {label}
      </p>
      <p className={`lp-num text-[15px] mt-1 ${gold ? 'lp-gold' : ''}`} style={{ color: gold ? undefined : 'var(--ivory-100)' }}>
        ₹{value}
      </p>
    </div>
  );
}

/** Desktop dashboard, in a milled browser frame. */
export function DashboardMockup() {
  return (
    <div className="lp-device lp-browser">
      <div className="lp-device-screen">
        {/* Chrome */}
        <div
          className="flex items-center gap-1.5 px-3 py-2 border-b"
          style={{ borderColor: 'rgba(201,169,106,0.18)', background: 'rgba(0,0,0,0.25)' }}
        >
          {['#c2703f', '#c9a96a', '#8fbfa4'].map((c) => (
            <span key={c} className="w-2 h-2 rounded-full" style={{ background: c, opacity: 0.75 }} />
          ))}
          <span className="ml-3 text-[9px] tracking-[0.14em] uppercase" style={{ color: 'var(--ivory-300)', opacity: 0.6 }}>
            Money Flow
          </span>
        </div>

        <div className="grid grid-cols-[128px_1fr] min-h-[300px] sm:min-h-[380px]">
          {/* Rail */}
          <div className="hidden sm:flex flex-col gap-1 p-3 border-r" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
            <span className="lp-display text-[12px] lp-gold mb-3">Money Flow</span>
            {['Dashboard', 'Transactions', 'People', 'Analytics', 'Settings'].map((n, i) => (
              <span
                key={n}
                className="text-[9.5px] px-2 py-1.5 rounded-full"
                style={{
                  color: i === 0 ? 'var(--gold-400)' : 'var(--ivory-300)',
                  background: i === 0 ? 'rgba(201,169,106,0.12)' : 'transparent',
                  opacity: i === 0 ? 1 : 0.62,
                }}
              >
                {n}
              </span>
            ))}
          </div>

          <div className="p-3.5 sm:p-4 space-y-3">
            <div>
              <p className="text-[8px] tracking-[0.18em] uppercase" style={{ color: 'var(--gold-500)' }}>
                Total spending
              </p>
              {/* The one figure that gets full gilt. */}
              <p className="lp-num lp-gold text-[30px] sm:text-[38px] leading-none mt-1.5">₹24,962</p>
              <p className="text-[9px] mt-1.5" style={{ color: 'var(--ivory-300)', opacity: 0.7 }}>
                25 transactions · August 2026
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <Stat label="Today" value="2,300" />
              <Stat label="This week" value="5,438" />
              <Stat label="Daily pace" value="1,085" />
            </div>

            <div className="glass-panel !rounded-xl p-3">
              <p className="text-[8px] tracking-[0.16em] uppercase mb-2.5" style={{ color: 'var(--ivory-300)', opacity: 0.75 }}>
                Where it went
              </p>
              <div className="space-y-2">
                {CATEGORIES.map(([name, amount, color, width]) => (
                  <div key={name}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[9.5px]" style={{ color: 'var(--ivory-100)' }}>
                        {name}
                      </span>
                      <span className="lp-num text-[9.5px]" style={{ color: 'var(--ivory-100)' }}>
                        ₹{amount}
                      </span>
                    </div>
                    <div className="h-[2px] rounded-full mt-1" style={{ background: 'rgba(255,255,255,0.07)' }}>
                      <div className="h-full rounded-full" style={{ width: `${width}%`, background: color }} />
                    </div>
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

/** Add-transaction sheet, in a phone frame. */
export function AddMockup() {
  return (
    <div className="lp-device lp-phone w-[236px] sm:w-[264px]">
      <div className="lp-device-screen p-3.5 space-y-3.5 min-h-[440px]">
        <div className="flex items-center justify-between">
          <span className="lp-display text-[13px]" style={{ color: 'var(--ivory-100)' }}>
            Add transaction
          </span>
          <span style={{ color: 'var(--ivory-300)', opacity: 0.6 }}>×</span>
        </div>

        <div className="grid grid-cols-3 gap-1 p-1 rounded-full" style={{ background: 'rgba(0,0,0,0.28)' }}>
          {['Expense', 'I lent', 'I borrowed'].map((t, i) => (
            <span
              key={t}
              className="text-[8.5px] text-center py-1.5 rounded-full"
              style={{
                background: i === 0 ? 'rgba(201,169,106,0.16)' : 'transparent',
                color: i === 0 ? 'var(--gold-400)' : 'var(--ivory-300)',
                opacity: i === 0 ? 1 : 0.6,
              }}
            >
              {t}
            </span>
          ))}
        </div>

        <div>
          <p className="text-[8px] tracking-[0.16em] uppercase mb-1.5" style={{ color: 'var(--gold-500)' }}>
            Amount
          </p>
          <div className="glass-panel !rounded-xl px-3 py-3">
            <span className="lp-num lp-gold text-[26px]">₹350</span>
          </div>
        </div>

        <div>
          <p className="text-[8px] tracking-[0.16em] uppercase mb-1.5" style={{ color: 'var(--ivory-300)', opacity: 0.75 }}>
            Category
          </p>
          <div className="flex flex-wrap gap-1.5">
            {['Outside Food', 'Transport', 'Shopping', 'Bills'].map((c, i) => (
              <span
                key={c}
                className="text-[8.5px] px-2 py-1 rounded-full border"
                style={
                  i === 0
                    ? { background: 'rgba(201,169,106,0.16)', borderColor: 'rgba(201,169,106,0.5)', color: 'var(--gold-400)' }
                    : { background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.1)', color: 'var(--ivory-300)' }
                }
              >
                {c}
              </span>
            ))}
          </div>
        </div>

        <div>
          <p className="text-[8px] tracking-[0.16em] uppercase mb-1.5" style={{ color: 'var(--ivory-300)', opacity: 0.75 }}>
            With
          </p>
          <div className="flex flex-wrap gap-1.5">
            {['Sankalp', 'Me', 'Mummy'].map((c, i) => (
              <span
                key={c}
                className="text-[8.5px] px-2 py-1 rounded-full border"
                style={
                  i === 0
                    ? { background: 'rgba(201,169,106,0.16)', borderColor: 'rgba(201,169,106,0.5)', color: 'var(--gold-400)' }
                    : { background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.1)', color: 'var(--ivory-300)' }
                }
              >
                {c}
              </span>
            ))}
          </div>
        </div>

        <div
          className="text-[9px] tracking-[0.16em] uppercase text-center py-2.5 rounded-full mt-1"
          style={{ background: 'linear-gradient(180deg,var(--gold-400),var(--gold-500))', color: '#241a06' }}
        >
          Save
        </div>
      </div>
    </div>
  );
}

/** Peer ledger, in a phone frame. Bronze for what you owe, not red. */
export function PeersMockup() {
  return (
    <div className="lp-device lp-phone w-[236px] sm:w-[264px]">
      <div className="lp-device-screen p-3.5 space-y-3 min-h-[440px]">
        <span className="lp-display text-[13px]" style={{ color: 'var(--ivory-100)' }}>
          People &amp; Ledger
        </span>

        <div className="grid grid-cols-2 gap-2">
          <div className="glass-panel !rounded-xl px-3 py-2.5">
            <p className="text-[7.5px] tracking-[0.14em] uppercase" style={{ color: 'var(--ivory-300)', opacity: 0.75 }}>
              They owe me
            </p>
            <p className="lp-num text-[15px] mt-1" style={{ color: '#8fbfa4' }}>
              ₹4,000
            </p>
          </div>
          <div className="glass-panel !rounded-xl px-3 py-2.5">
            <p className="text-[7.5px] tracking-[0.14em] uppercase" style={{ color: 'var(--ivory-300)', opacity: 0.75 }}>
              I owe
            </p>
            <p className="lp-num text-[15px] mt-1" style={{ color: 'var(--bronze)' }}>
              ₹13,950
            </p>
          </div>
        </div>

        <div className="glass-panel !rounded-xl px-3 py-2.5">
          <p className="text-[7.5px] tracking-[0.14em] uppercase" style={{ color: 'var(--gold-500)' }}>
            Net position
          </p>
          <p className="lp-num text-[19px] mt-1" style={{ color: 'var(--bronze)' }}>
            −₹9,950
          </p>
        </div>

        <div className="glass-panel !rounded-xl divide-y" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
          {[
            ['Mummy', '2,500', 'owed'],
            ['Sankalp', '1,000', 'owed'],
            ['Aarya', '500', 'owed'],
            ['Aditi', '13,950', 'owe'],
          ].map(([name, amt, dir]) => (
            <div key={name} className="flex items-center justify-between px-3 py-2.5">
              <span className="text-[10px]" style={{ color: 'var(--ivory-100)' }}>
                {name}
              </span>
              <span className="lp-num text-[10px]" style={{ color: dir === 'owed' ? '#8fbfa4' : 'var(--bronze)' }}>
                {dir === 'owed' ? '+' : '−'}₹{amt}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Small people leaderboard used beside the hero copy. */
export function PeopleStrip() {
  return (
    <div className="glass-panel !rounded-xl px-3 py-2.5 w-full">
      <p className="text-[8px] tracking-[0.16em] uppercase mb-2" style={{ color: 'var(--gold-500)' }}>
        Who it was with
      </p>
      <div className="space-y-1.5">
        {PEOPLE.map(([n, v]) => (
          <div key={n} className="flex items-center justify-between">
            <span className="text-[9.5px]" style={{ color: 'var(--ivory-100)' }}>
              {n}
            </span>
            <span className="lp-num text-[9.5px]" style={{ color: 'var(--ivory-300)' }}>
              ₹{v}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
