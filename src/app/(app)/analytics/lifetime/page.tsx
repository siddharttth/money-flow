'use client';

import useSWR from 'swr';
import { formatINR } from '@/lib/money';
import type { SavedMonth } from '@/lib/plan';
import {
  Card,
  CardStrip,
  Disclosure,
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
import { LifetimeTotals, SavingsHistory, type LifetimeTallyRow } from '@/components/plan-cards';
import { useInspector } from '@/components/inspector';
import { SpendCalendar } from '@/components/spend-calendar';
import type { CalendarDay } from '@/lib/analytics';
import { useGrowClass } from '@/components/motion';

type CategoryTotal = {
  categoryId: string;
  name: string;
  icon: string;
  color: string;
  totalMinor: number;
  count: number;
  firstDate: string | null;
};

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
  const calendar = useSWR<{ firstDate: string | null; days: CalendarDay[] }>('/api/analytics/calendar');

  if (lifetime.error) return <ErrorState message={lifetime.error.message} onRetry={() => lifetime.mutate()} />;

  const life = lifetime.data;
  const rows = saved.data?.items ?? [];
  const withIncome = rows.filter((r) => r.ratePct != null);

  const best = withIncome.length
    ? withIncome.reduce((a, b) => (b.savedMinor > a.savedMinor ? b : a))
    : null;
  const positiveStreak = longestPositiveRun(rows);
  const years = yearsOf(rows);

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

      {/* ---------- Lifetime totals ----------
          Of everything earned, where it went and what is left: savings as the
          page's one large figure, the earned − spent − invested behind it, and
          the running tallies as the card's footer row. No lending — People
          owns what is owed either way. */}
      <Card className={`!p-5 sm:!p-6 glow-card bloom-lg ${life?.known && life.savingsMinor < 0 ? 'bloom-danger' : ''}`}>
        {!life ? (
          <ListSkeleton rows={4} />
        ) : (
          <div className="relative">
            <LifetimeTotals data={life} />

            <CardStrip pad="lg">
              <StatStrip
                bare
                items={[
                  {
                    label: 'Months tracked',
                    value: String(life.months ?? 0),
                    sub: life.firstMonth ?? undefined,
                    /* Back to where it started. */
                    href: life.firstMonth ? `/analytics/month?month=${life.firstMonth}` : undefined,
                  },
                  {
                    /* Of everything earned, the share still saved — the
                       headline above as a proportion. */
                    label: 'Savings rate',
                    value: life.inMinor > 0 ? `${Math.round((life.savingsMinor / life.inMinor) * 100)}%` : '—',
                    sub: 'of everything earned',
                  },
                  {
                    label: 'Best month kept',
                    minor: best?.savedMinor ?? 0,
                    sub: best ? monthName(best.month) : undefined,
                    href: best ? `/analytics/month?month=${best.month}` : undefined,
                  },
                  {
                    label: 'Positive streak',
                    value: `${positiveStreak} ${positiveStreak === 1 ? 'month' : 'months'}`,
                    sub: 'kept more than you spent',
                  },
                ]}
              />
            </CardStrip>
          </div>
        )}
      </Card>

      {/* ---------- The two trends ----------
          One card, two halves the same height. The spend chart takes the
          height the savings list sets, so neither half ends early. */}
      <div>
        <SectionHead label="Over time" />
        <Card className="!p-0 overflow-clip">
          <div className="grid grid-cols-1 lg:grid-cols-2">
            <div className="p-4 sm:p-5 min-w-0 flex flex-col">
              {(trends.data?.items.length ?? 0) >= 2 ? (
                <>
                  <h3 className="text-[15px] font-semibold mb-1">What you spend</h3>
                  <p className="muted text-[12px] mb-4">Month by month. Tap a bar to open that month.</p>
                  <MonthBars
                    fill
                    data={trends.data!.items}
                    activeMonth=""
                    onPick={(m) => (window.location.href = `/analytics/month?month=${m}`)}
                    height={150}
                    maxHeight={280}
                  />
                </>
              ) : (
                <EmptyState compact title="Not enough history yet" hint="A trend needs at least two months." />
              )}
            </div>

            <div
              className="p-4 sm:p-5 min-w-0 border-t lg:border-t-0 lg:border-l"
              style={{ borderColor: 'var(--border)' }}
            >
              {rows.some((r) => r.ratePct != null) ? (
                <SavingsHistory bare rows={rows} recent={12} />
              ) : (
                <EmptyState compact title="Nothing kept yet" hint="Log some income and this fills in." />
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* ---------- Every day ----------
          The months above are totals; this is their texture — which days the
          money went out on. */}
      {calendar.data?.firstDate && (
        <div>
          <SectionHead label="Every day" />
          <Card>
            <SpendCalendar firstDate={calendar.data.firstDate} days={calendar.data.days} />
          </Card>
        </div>
      )}

      {/* ---------- All-time categories ---------- */}
      <div>
        <SectionHead label="What it has all gone on" />
        <Card>
          {!cats.data ? (
            <ListSkeleton rows={6} />
          ) : cats.data.items.length ? (
            <>
              <BreakdownList
                columns
                items={cats.data.items.map((c) => ({
                  id: c.categoryId,
                  name: c.name,
                  color: c.color,
                  icon: c.icon,
                  totalMinor: c.totalMinor,
                  count: c.count,
                }))}
                /* Lifetime scope: month-by-month totals, not September's rows. */
                onPick={(id) => openCategory(id, 'lifetime')}
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

      {/* ---------- More history ----------
          The year-on-year comparison is the least-read thing here and needs
          two calendar years to exist at all. Folded, with the answer on the
          closed header; absent entirely until there are two years. */}
      {years.length >= 2 && (
        <div>
          <SectionHead label="More history" />
          <Card className="!p-0 overflow-clip">
            <Disclosure title="Year on year" summary={<span className="muted">{years.length} years</span>}>
              <YearOverYear years={years} />
            </Disclosure>
          </Card>
        </div>
      )}

      {life && life.months >= 2 && (
        <Insight>
          Every figure on this page is the sum of the months behind it. A bad
          month is one instalment; this is the balance.
        </Insight>
      )}
    </div>
  );
}

type YearRow = [year: string, totals: { inMinor: number; outMinor: number; savedMinor: number }];

/**
 * A full calendar year each side, and nothing at all below one.
 *
 * The same gate the app uses for goal pace: a "year on year" built out of five
 * months is a sentence with no year in it. The caller checks for two years
 * before drawing anything.
 */
function yearsOf(rows: SavedMonth[]): YearRow[] {
  const byYear = new Map<string, { inMinor: number; outMinor: number; savedMinor: number }>();
  for (const r of rows) {
    const y = r.month.slice(0, 4);
    const acc = byYear.get(y) ?? { inMinor: 0, outMinor: 0, savedMinor: 0 };
    acc.inMinor += r.inMinor;
    acc.outMinor += r.outMinor;
    acc.savedMinor += r.savedMinor;
    byYear.set(y, acc);
  }
  return [...byYear.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function YearOverYear({ years }: { years: YearRow[] }) {
  const max = Math.max(...years.map(([, v]) => Math.max(v.inMinor, v.outMinor)), 1);

  return (
    /* Capped: a year's in-and-out bar a thousand pixels long is harder to
       compare against the next year's, not easier. */
    <ul className="space-y-4 max-w-2xl">
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
  );
}

function YearBar({ label, minor, max, color }: { label: string; minor: number; max: number; color: string }) {
  const grow = useGrowClass();
  return (
    <div className="flex items-center gap-2.5">
      <span className="micro w-6 shrink-0">{label}</span>
      <span className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
        <span
          className={`block h-full rounded-full ${grow}`}
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
