'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { formatINR } from '@/lib/money';
import type { SavedMonth } from '@/lib/plan';
import {
  Card,
  EmptyState,
  ErrorState,
  Insight,
  ListSkeleton,
  Money,
  PageHeader,
  SectionHead,
  StatStrip,
} from '@/components/ui';
import { MonthBars } from '@/components/graph';
import { InsightsTabs } from '@/components/insights-tabs';
import { BreakdownList } from '@/components/breakdown';
import { LifetimeInHand, SavingsHistory, type LifetimeTallyRow } from '@/components/plan-cards';
import { useInspector } from '@/components/inspector';

type CategoryTotal = {
  categoryId: string;
  name: string;
  icon: string;
  color: string;
  totalMinor: number;
  count: number;
  firstDate: string | null;
};

type PeerSummary = { owedToMeMinor: number; owedByMeMinor: number; netMinor: number };
type Invest = { lifetimeMinor: number; contributionCount: number; firstDate: string | null };

/**
 * THE WHOLE ARC — and deliberately no month picker.
 *
 * Everything here is month-independent, which is exactly why it used to sit
 * awkwardly at the bottom of a month-scoped Analytics page: twelve months of
 * bars under a control that claimed to filter them and did not.
 *
 * The month is the unit of accounting. This page is the unit of progress.
 */
export default function LifetimePage() {
  const { openCategory } = useInspector();

  const lifetime = useSWR<LifetimeTallyRow>('/api/analytics/lifetime');
  const saved = useSWR<{ items: SavedMonth[] }>('/api/analytics/savings?months=24');
  const trends = useSWR<{ items: { month: string; totalMinor: number }[] }>('/api/analytics/trends?months=24');
  const cats = useSWR<{ items: CategoryTotal[] }>('/api/analytics/category-totals');
  const peers = useSWR<PeerSummary>('/api/ledger');
  const invest = useSWR<Invest>('/api/analytics/investments');

  if (lifetime.error) return <ErrorState message={lifetime.error.message} onRetry={() => lifetime.mutate()} />;

  const life = lifetime.data;
  const rows = saved.data?.items ?? [];
  const withIncome = rows.filter((r) => r.ratePct != null);

  /*
   * NET POSITION — what you have built, as opposed to what is in the account.
   *
   * No screen answered this, and the closest one got it wrong: the lifetime
   * card subtracts investments because it is reporting cash, which is correct
   * and also not the whole picture. Here investments come back, the ledger is
   * counted on both sides, and each line says which pile it belongs to.
   */
  const netMinor =
    (life?.inHandMinor ?? 0) +
    (life?.investedMinor ?? 0) +
    (peers.data?.owedToMeMinor ?? 0) -
    (peers.data?.owedByMeMinor ?? 0);

  const best = withIncome.length
    ? withIncome.reduce((a, b) => (b.savedMinor > a.savedMinor ? b : a))
    : null;
  const positiveStreak = longestPositiveRun(rows);

  return (
    <div className="space-y-6">
      <div className="lg:hidden">
        <InsightsTabs />
      </div>

      <PageHeader
        eyebrow="Lifetime"
        title="The whole arc"
        sub="Every month added up. Nothing on this page moves when you change the month elsewhere."
      />

      {/* ---------- Net position ---------- */}
      <Card className="!p-5 sm:!p-6">
        {!life ? (
          <ListSkeleton rows={4} />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] gap-6 lg:gap-8 items-start">
            <div>
              <p className="label mb-2">What you have built</p>
              <span
                className="num text-[2.4rem] sm:text-5xl font-semibold leading-none tracking-tight"
                style={netMinor < 0 ? { color: 'var(--rule-red)' } : undefined}
              >
                {netMinor < 0 && '−'}
                {formatINR(Math.abs(netMinor))}
              </span>
              <p className="muted text-[13px] mt-2.5 leading-relaxed">
                Cash, investments and the ledger together — the one figure the
                app never showed.
              </p>
            </div>

            <div className="min-w-0">
              <dl className="space-y-2">
                <PositionLine label="Cash in hand" minor={life.inHandMinor} href="#in-hand" />
                <PositionLine label="Invested" minor={life.investedMinor} href="/goals" tone="var(--credit)" />
                <PositionLine label="Owed to you" minor={peers.data?.owedToMeMinor ?? 0} href="/people" />
                <PositionLine
                  label="You owe"
                  minor={-(peers.data?.owedByMeMinor ?? 0)}
                  href="/people"
                  tone="var(--rule-red)"
                />
                <div className="pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                  <PositionLine label="Net position" minor={netMinor} strong />
                </div>
              </dl>
              <p className="muted text-[12px] mt-3.5 leading-relaxed">
                Investments are added back here — this is net worth, not cash.
                The card below is the cash half of the same arithmetic.
              </p>
            </div>
          </div>
        )}
      </Card>

      {/* ---------- Lifetime in hand ---------- */}
      <div id="in-hand">{life && <LifetimeInHand data={life} />}</div>

      <StatStrip
        items={[
          { label: 'Months tracked', value: String(life?.months ?? 0), sub: life?.firstMonth ?? undefined },
          { label: 'Ever invested', minor: invest.data?.lifetimeMinor ?? 0, tone: 'var(--credit)' },
          {
            label: 'Best month kept',
            minor: best?.savedMinor ?? 0,
            sub: best ? monthName(best.month) : undefined,
          },
          {
            label: 'Positive streak',
            value: `${positiveStreak} ${positiveStreak === 1 ? 'month' : 'months'}`,
            sub: 'kept more than you spent',
          },
        ]}
      />

      {/* ---------- The two trends ---------- */}
      <div>
        <SectionHead label="Over time" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
          <Card>
            {(trends.data?.items.length ?? 0) >= 2 ? (
              <>
                <h3 className="text-[15px] font-semibold mb-1">What you spend</h3>
                <p className="muted text-[12px] mb-4">Month by month. Tap a bar to open that month.</p>
                <MonthBars
                  data={trends.data!.items}
                  activeMonth=""
                  onPick={(m) => (window.location.href = `/analytics/month?month=${m}`)}
                  height={150}
                />
              </>
            ) : (
              <EmptyState title="Not enough history yet" hint="A trend needs at least two months." />
            )}
          </Card>

          {rows.length ? (
            <SavingsHistory rows={rows} />
          ) : (
            <Card>
              <EmptyState title="Nothing kept yet" hint="Log some income and this fills in." />
            </Card>
          )}
        </div>
      </div>

      {/* ---------- All-time categories ---------- */}
      <div>
        <SectionHead label="What it has all gone on" />
        <Card>
          {!cats.data ? (
            <ListSkeleton rows={6} />
          ) : cats.data.items.length ? (
            <>
              <BreakdownList
                items={cats.data.items.map((c) => ({
                  id: c.categoryId,
                  name: c.name,
                  color: c.color,
                  icon: c.icon,
                  totalMinor: c.totalMinor,
                  count: c.count,
                }))}
                onPick={openCategory}
              />
              <p className="muted text-[12px] mt-4 leading-relaxed">
                Every category, every month, since you started. The monthly view
                answers what is moving; this answers what it has cost.
              </p>
            </>
          ) : (
            <EmptyState title="Nothing logged yet" />
          )}
        </Card>
      </div>

      {/* ---------- Lending, all time ---------- */}
      {peers.data && (peers.data.owedToMeMinor > 0 || peers.data.owedByMeMinor > 0) && (
        <div>
          <SectionHead
            label="Lending, all time"
            action={
              <Link href="/people" className="micro micro-link" style={{ color: 'var(--accent)' }}>
                Open
              </Link>
            }
          />
          <StatStrip
            cols={3}
            items={[
              { label: 'Owed to you', minor: peers.data.owedToMeMinor, tone: 'var(--credit)' },
              { label: 'You owe', minor: peers.data.owedByMeMinor, tone: 'var(--rule-red)' },
              {
                label: 'Net',
                minor: Math.abs(peers.data.netMinor),
                sub: peers.data.netMinor >= 0 ? 'in your favour' : 'against you',
              },
            ]}
          />
        </div>
      )}

      {/* ---------- Year over year, once there is a year ---------- */}
      <YearOverYear rows={rows} />

      {life && life.months >= 2 && (
        <Insight>
          Every figure on this page is the sum of the months behind it. A bad
          month is one instalment; this is the balance.
        </Insight>
      )}
    </div>
  );
}

function PositionLine({
  label,
  minor,
  href,
  tone,
  strong,
}: {
  label: string;
  minor: number;
  href?: string;
  tone?: string;
  strong?: boolean;
}) {
  const body = (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={`text-[12.5px] ${strong ? 'font-semibold' : ''}`} style={{ color: strong ? 'var(--text)' : 'var(--text-muted)' }}>
        {label}
      </dt>
      <dd className={`num text-[13px] ${strong ? 'font-semibold' : ''}`} style={tone ? { color: tone } : undefined}>
        {minor < 0 ? '−' : ''}
        {formatINR(Math.abs(minor))}
      </dd>
    </div>
  );
  return href ? (
    <Link href={href} className="row block -mx-2 px-2 py-0.5 rounded">
      {body}
    </Link>
  ) : (
    body
  );
}

/**
 * A full calendar year each side, and nothing at all below one.
 *
 * The same gate the app uses for goal pace: a "year on year" built out of five
 * months is a sentence with no year in it.
 */
function YearOverYear({ rows }: { rows: SavedMonth[] }) {
  const byYear = new Map<string, { inMinor: number; outMinor: number; savedMinor: number }>();
  for (const r of rows) {
    const y = r.month.slice(0, 4);
    const acc = byYear.get(y) ?? { inMinor: 0, outMinor: 0, savedMinor: 0 };
    acc.inMinor += r.inMinor;
    acc.outMinor += r.outMinor;
    acc.savedMinor += r.savedMinor;
    byYear.set(y, acc);
  }
  if (byYear.size < 2) return null;

  const years = [...byYear.entries()].sort(([a], [b]) => a.localeCompare(b));
  const max = Math.max(...years.map(([, v]) => Math.max(v.inMinor, v.outMinor)), 1);

  return (
    <div>
      <SectionHead label="Year on year" />
      <Card>
        <ul className="space-y-4">
          {years.map(([year, v]) => (
            <li key={year}>
              <div className="flex items-baseline justify-between gap-3 mb-2">
                <span className="text-[13.5px] font-semibold num">{year}</span>
                <span className="muted text-[12px]">
                  kept <Money minor={v.savedMinor} className="num font-semibold" />
                </span>
              </div>
              <div className="space-y-1">
                <YearBar label="In" minor={v.inMinor} max={max} color="var(--credit)" />
                <YearBar label="Out" minor={v.outMinor} max={max} color="var(--text-muted)" />
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function YearBar({ label, minor, max, color }: { label: string; minor: number; max: number; color: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="micro w-6 shrink-0">{label}</span>
      <span className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
        <span
          className="block h-full rounded-full"
          style={{ width: `${Math.max(1, (minor / max) * 100)}%`, background: color }}
        />
      </span>
      <span className="num text-[11px] muted w-20 text-right shrink-0">{formatINR(minor)}</span>
    </div>
  );
}

/** The longest run of consecutive months that ended up ahead. */
function longestPositiveRun(rows: SavedMonth[]): number {
  let best = 0;
  let run = 0;
  for (const r of rows) {
    if (r.savedMinor > 0) {
      run += 1;
      best = Math.max(best, run);
    } else {
      run = 0;
    }
  }
  return best;
}

function monthName(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-IN', { month: 'long', timeZone: 'UTC' });
}
