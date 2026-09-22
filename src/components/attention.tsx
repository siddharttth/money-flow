'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { AttentionItem } from '@/lib/attention';
import { Card } from './ui';

/**
 * The list that turns the app from something you read into something that
 * tells you. Usually short. Often empty — and saying so plainly is the point,
 * because an app that respects your time is the actual premium signal.
 *
 * Dismissals are per-month and per-item, kept locally: a rule you have
 * acknowledged should not nag for the rest of September, and should absolutely
 * come back in October if it is still true.
 */
const KEY = 'mf-attention-dismissed';

function readDismissed(month: string): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    return new Set<string>(raw[month] ?? []);
  } catch {
    return new Set();
  }
}

export function AttentionList({ items, month }: { items: AttentionItem[]; month: string }) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setDismissed(readDismissed(month));
    setReady(true);
  }, [month]);

  function dismiss(id: string) {
    const next = new Set(dismissed);
    next.add(id);
    setDismissed(next);
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
      localStorage.setItem(KEY, JSON.stringify({ ...raw, [month]: [...next] }));
    } catch {
      /* storage unavailable — the list simply does not remember */
    }
  }

  // Nothing until localStorage has been read, or a dismissed row flashes in.
  if (!ready) return null;

  const visible = items.filter((i) => !dismissed.has(i.id));
  if (!visible.length) return null;

  const good = visible.length === 1 && visible[0].tone === 'good';

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-2.5">
        <span className="label mb-0">{good ? 'Nothing needs you' : 'Needs your attention'}</span>
        {!good && <span className="micro">{visible.length}</span>}
      </div>

      <Card className="!p-0 overflow-clip">
        <ul>
          {visible.map((item, i) => (
            <li
              key={item.id}
              className="attention-row flex items-start gap-3 px-4 py-3.5"
              style={i > 0 ? { borderTop: '1px solid var(--border)' } : undefined}
            >
              {/* An icon tile rather than a bare dot — the row reads as a card
                  in a list, which is what the rest of the system does. */}
              <span
                aria-hidden
                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                style={{
                  background: `color-mix(in oklab, ${toneColor(item.tone)} 14%, transparent)`,
                  color: toneColor(item.tone),
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'currentColor' }} />
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-[13.5px] font-semibold">{item.title}</p>
                  {/* The severity, named. "Over budget" and "will pass its
                      budget" are a fact and a forecast, and a reader skimming
                      six rows should not have to parse the sentence to tell
                      them apart. */}
                  <span
                    className="badge"
                    style={{
                      background: `color-mix(in oklab, ${toneColor(item.tone)} 14%, transparent)`,
                      color: toneColor(item.tone),
                      fontSize: '10px',
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                    }}
                  >
                    {severity(item)}
                  </span>
                </div>
                <p className="muted text-[12px] mt-0.5 leading-relaxed">{item.detail}</p>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {item.action && (
                  <Link href={item.action.href} className="tag" style={{ color: 'var(--accent)' }}>
                    {item.action.label}
                  </Link>
                )}
                {item.tone !== 'good' && (
                  <button
                    className="tag"
                    aria-label={`Dismiss: ${item.title}`}
                    onClick={() => dismiss(item.id)}
                    title="Not this month"
                  >
                    ×
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

/**
 * A two-word name for what kind of problem this is, derived from the rule's
 * own id — so the label cannot drift from the rule that raised it.
 */
function severity(item: AttentionItem): string {
  const kind = item.id.split(':')[0];
  switch (kind) {
    case 'budget-over':
      return 'Overrun';
    case 'budget-pace':
      return 'Forecast';
    case 'income':
      return 'Unlogged';
    case 'goal':
      return 'Behind';
    case 'debt':
      return 'Outstanding';
    case 'pace':
      return 'Running hot';
    default:
      return 'On track';
  }
}

function toneColor(tone: AttentionItem['tone']): string {
  return tone === 'urgent' ? 'var(--rule-red)' : tone === 'good' ? 'var(--credit)' : 'var(--hi)';
}
