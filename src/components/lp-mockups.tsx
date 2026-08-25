import { Icon, type IconKey } from './icons';
import { IPhone, MacBook } from './lp-devices';

/**
 * Product previews as live markup rather than screenshots, so they carry the
 * same glass material and gilt numerals as the marketing chrome around them.
 * Every figure below is a real value from the running app.
 */

const CATEGORIES: [string, string, IconKey, string, number][] = [
  ['Investment', '10,000', 'invest', '#c9a96a', 100],
  ['Shopping', '4,843', 'shop', '#9ec2ad', 48],
  ['Outside Food', '2,921', 'food', '#c2703f', 29],
  ['Misc', '2,140', 'misc', '#8aa79a', 21],
  ['Ciggs / Alc', '1,931', 'smoke', '#b5675a', 19],
];

const PEOPLE: [string, string][] = [
  ['Me', '13,480'],
  ['Sankalp', '3,764'],
  ['Mummy', '2,208'],
  ['Aarya', '2,160'],
];

/** Small circular initial badge, matching the app's person marks. */
function Initial({ name, size = 15 }: { name: string; size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center shrink-0 rounded-full font-semibold"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.52),
        background: 'rgba(201,169,106,0.18)',
        color: 'var(--gold-400)',
        border: '0.5px solid rgba(201,169,106,0.4)',
      }}
      aria-hidden
    >
      {name.trim()[0]?.toUpperCase()}
    </span>
  );
}

function Chip({ label, icon, person, on }: { label: string; icon?: IconKey; person?: boolean; on?: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-full border"
      style={
        on
          ? { background: 'rgba(201,169,106,0.18)', borderColor: 'rgba(201,169,106,0.55)', color: 'var(--gold-400)' }
          : { background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.12)', color: 'var(--ivory-300)' }
      }
    >
      {person ? <Initial name={label} size={16} /> : icon ? <Icon name={icon} size={14} /> : null}
      {label}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-panel !rounded-xl px-3 py-2.5">
      <p className="text-[10px] tracking-[0.16em] uppercase" style={{ color: 'var(--ivory-300)', opacity: 0.72 }}>
        {label}
      </p>
      <p className="lp-num text-[24px] mt-1" style={{ color: 'var(--ivory-100)' }}>
        ₹{value}
      </p>
    </div>
  );
}

export function DashboardMockup() {
  return (
    <MacBook>
      <div className="grid grid-cols-[150px_1fr] min-h-[560px]">
        <div className="flex flex-col gap-1 p-4 pt-9 border-r" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
          <span className="lp-display text-[14px] lp-gold mb-3">Money Flow</span>
          {['Dashboard', 'Transactions', 'People', 'Analytics', 'Settings'].map((n, i) => (
            <span
              key={n}
              className="text-[11.5px] px-2 py-1.5 rounded-full"
              style={{
                color: i === 0 ? 'var(--gold-400)' : 'var(--ivory-300)',
                background: i === 0 ? 'rgba(201,169,106,0.13)' : 'transparent',
                opacity: i === 0 ? 1 : 0.6,
              }}
            >
              {n}
            </span>
          ))}
        </div>

        {/* pt clears the camera housing. */}
        <div className="p-5 pt-9 space-y-5">
          <div>
            <p className="text-[10px] tracking-[0.18em] uppercase" style={{ color: 'var(--gold-500)' }}>
              Total spending
            </p>
            <p className="lp-num lp-gold text-[44px] leading-none mt-1.5">₹24,962</p>
            <p className="text-[11px] mt-1.5" style={{ color: 'var(--ivory-300)', opacity: 0.7 }}>
              25 transactions · August 2026
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Stat label="Today" value="2,300" />
            <Stat label="This week" value="5,438" />
            <Stat label="Daily pace" value="1,085" />
          </div>

          <div className="glass-panel !rounded-xl p-3">
            <p className="text-[10px] tracking-[0.16em] uppercase mb-3" style={{ color: 'var(--ivory-300)', opacity: 0.72 }}>
              Where it went
            </p>
            <div className="space-y-2.5">
              {CATEGORIES.map(([name, amount, icon, color, width]) => (
                <div key={name}>
                  {/* Label and amount on their own line, bar cleanly below. */}
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span style={{ color }} className="shrink-0 flex">
                      <Icon name={icon} size={14} />
                    </span>
                    <span className="text-[11.5px] flex-1 truncate" style={{ color: 'var(--ivory-100)' }}>
                      {name}
                    </span>
                    <span className="lp-num text-[11.5px]" style={{ color: 'var(--ivory-100)' }}>
                      ₹{amount}
                    </span>
                  </div>
                  <div className="h-[7px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                    <div className="h-full rounded-full" style={{ width: `${width}%`, background: color }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-panel !rounded-xl p-4">
            <p className="text-[10px] tracking-[0.16em] uppercase mb-3" style={{ color: 'var(--ivory-300)', opacity: 0.72 }}>
              Who it was with
            </p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2.5">
              {PEOPLE.map(([n, v]) => (
                <div key={n} className="flex items-center gap-2">
                  <Initial name={n} size={18} />
                  <span className="text-[12px] flex-1 truncate" style={{ color: 'var(--ivory-100)' }}>
                    {n}
                  </span>
                  <span className="lp-num text-[12px]" style={{ color: 'var(--ivory-300)' }}>
                    ₹{v}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </MacBook>
  );
}

export function AddMockup() {
  return (
    <IPhone>
      <div className="p-4 pt-12 space-y-4 min-h-[478px]">
        <div className="flex items-center justify-between">
          <span className="lp-display text-[16px]" style={{ color: 'var(--ivory-100)' }}>
            Add transaction
          </span>
          <span style={{ color: 'var(--ivory-300)', opacity: 0.6 }}>×</span>
        </div>

        <div className="grid grid-cols-3 gap-1 p-1 rounded-full" style={{ background: 'rgba(0,0,0,0.3)' }}>
          {['Expense', 'I lent', 'I borrowed'].map((t, i) => (
            <span
              key={t}
              className="text-[10.5px] text-center py-1.5 rounded-full"
              style={{
                background: i === 0 ? 'rgba(201,169,106,0.18)' : 'transparent',
                color: i === 0 ? 'var(--gold-400)' : 'var(--ivory-300)',
                opacity: i === 0 ? 1 : 0.6,
              }}
            >
              {t}
            </span>
          ))}
        </div>

        <div>
          <p className="text-[10px] tracking-[0.16em] uppercase mb-1.5" style={{ color: 'var(--gold-500)' }}>
            Amount
          </p>
          <div className="glass-panel !rounded-xl px-3 py-3">
            <span className="lp-num lp-gold text-[34px]">₹350</span>
          </div>
        </div>

        <div>
          <p className="text-[10px] tracking-[0.16em] uppercase mb-1.5" style={{ color: 'var(--ivory-300)', opacity: 0.72 }}>
            Category
          </p>
          <div className="flex flex-wrap gap-1.5">
            <Chip label="Outside Food" icon="food" on />
            <Chip label="Transport" icon="transport" />
            <Chip label="Shopping" icon="shop" />
            <Chip label="Bills" icon="bill" />
          </div>
        </div>

        <div>
          <p className="text-[10px] tracking-[0.16em] uppercase mb-1.5" style={{ color: 'var(--ivory-300)', opacity: 0.72 }}>
            With
          </p>
          <div className="flex flex-wrap gap-1.5">
            <Chip label="Sankalp" person on />
            <Chip label="Me" person />
            <Chip label="Mummy" person />
          </div>
        </div>

        <div
          className="text-[11px] tracking-[0.16em] uppercase text-center py-2.5 rounded-full mt-1"
          style={{ background: 'linear-gradient(180deg,var(--gold-400),var(--gold-500))', color: '#241a06' }}
        >
          Save
        </div>
      </div>
    </IPhone>
  );
}

export function PeersMockup() {
  return (
    <IPhone>
      <div className="p-4 pt-12 space-y-3.5 min-h-[478px]">
        <span className="lp-display text-[16px]" style={{ color: 'var(--ivory-100)' }}>
          People &amp; Ledger
        </span>

        <div className="grid grid-cols-2 gap-2">
          <div className="glass-panel !rounded-xl px-3 py-2.5">
            <p className="text-[12px] tracking-[0.14em] uppercase" style={{ color: 'var(--ivory-300)', opacity: 0.72 }}>
              They owe me
            </p>
            <p className="lp-num text-[24px] mt-1" style={{ color: '#9ec2ad' }}>
              ₹4,000
            </p>
          </div>
          <div className="glass-panel !rounded-xl px-3 py-2.5">
            <p className="text-[12px] tracking-[0.14em] uppercase" style={{ color: 'var(--ivory-300)', opacity: 0.72 }}>
              I owe
            </p>
            <p className="lp-num text-[24px] mt-1" style={{ color: 'var(--bronze)' }}>
              ₹13,950
            </p>
          </div>
        </div>

        <div className="glass-panel !rounded-xl px-3 py-2.5">
          <p className="text-[12px] tracking-[0.14em] uppercase" style={{ color: 'var(--gold-500)' }}>
            Net position
          </p>
          <p className="lp-num text-[24px] mt-1" style={{ color: 'var(--bronze)' }}>
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
            <div key={name} className="flex items-center gap-2 px-3 py-2.5">
              <Initial name={name} />
              <span className="text-[12px] flex-1" style={{ color: 'var(--ivory-100)' }}>
                {name}
              </span>
              <span className="lp-num text-[12px]" style={{ color: dir === 'owed' ? '#9ec2ad' : 'var(--bronze)' }}>
                {dir === 'owed' ? '+' : '−'}₹{amt}
              </span>
            </div>
          ))}
        </div>
      </div>
    </IPhone>
  );
}

export function PeopleStrip() {
  return (
    <div className="glass-panel !rounded-xl px-3 py-2.5 w-full">
      <p className="text-[10.5px] tracking-[0.16em] uppercase mb-2" style={{ color: 'var(--gold-500)' }}>
        Who it was with
      </p>
      <div className="space-y-1.5">
        {PEOPLE.map(([n, v]) => (
          <div key={n} className="flex items-center gap-2">
            <Initial name={n} size={16} />
            <span className="text-[12px] flex-1" style={{ color: 'var(--ivory-100)' }}>
              {n}
            </span>
            <span className="lp-num text-[12px]" style={{ color: 'var(--ivory-300)' }}>
              ₹{v}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
