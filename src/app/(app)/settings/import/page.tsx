'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { useSWRConfig } from 'swr';
import { api, RequestError } from '@/lib/client';
import { dayLabel } from '@/lib/dates';
import type { ColumnMapping, ImportPreview } from '@/lib/importer';
import { Card, EmptyState, SectionTitle } from '@/components/ui';
import { useShell } from '@/components/app-shell';

const ROLES: ColumnMapping['role'][] = ['date', 'category', 'person', 'ignore'];

export default function ImportPage() {
  const { toast } = useShell();
  const { mutate } = useSWRConfig();
  const fileRef = useRef<HTMLInputElement>(null);

  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ importedCount: number; importedTotal: number } | null>(null);
  const [fallbackYear, setFallbackYear] = useState(String(new Date().getFullYear()));

  async function onFile(file: File) {
    setError(null);
    setDone(null);
    const text = await file.text();
    setCsv(text);
    setFileName(file.name);
    await runPreview(text);
  }

  async function runPreview(text = csv, mapping?: ColumnMapping[]) {
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<ImportPreview>('/api/import/preview', {
        csv: text,
        mapping,
        fallbackYear: Number(fallbackYear) || undefined,
      });
      setPreview(result);
    } catch (err) {
      setError(err instanceof RequestError ? err.message : 'Could not read that file');
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }

  /** Changing a column's role re-runs the whole reconstruction server-side. */
  function setRole(header: string, role: ColumnMapping['role']) {
    if (!preview) return;
    const next = preview.mapping.map((m) => (m.header === header ? { ...m, role } : m));
    runPreview(csv, next);
  }

  async function commit() {
    if (!preview?.rows.length) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<{ importedCount: number; importedTotal: number }>('/api/import/commit', {
        rows: preview.rows.map(({ amount, categoryName, expenseDate, personName, note }) => ({
          amount,
          categoryName,
          expenseDate,
          personName,
          note,
        })),
        createMissing: true,
      });
      await mutate((k) => typeof k === 'string' && k.startsWith('/api/'), undefined, { revalidate: true });
      setDone(result);
      setPreview(null);
      setCsv('');
      toast(`Imported ${result.importedCount} expenses`);
    } catch (err) {
      setError(err instanceof RequestError ? err.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  }

  const totalsMatch =
    preview?.sheetTotal == null || Math.abs(preview.sheetTotal - preview.computedTotal) < 0.5;

  return (
    <div className="space-y-5">
      <Link href="/settings" className="muted text-sm">
        ‹ Settings
      </Link>

      <div>
        <h1 className="text-xl sm:text-2xl font-semibold">Import from Google Sheet</h1>
        <p className="muted text-sm mt-1">
          Export one month tab as CSV and drop it here. Category and person columns get turned into real transactions
          — an ₹800 row tagged to Sankalp stays one ₹800 expense, never ₹1,600.
        </p>
      </div>

      {done && (
        <Card>
          <EmptyState
            icon="✅"
            title={`Imported ${done.importedCount} expenses`}
            hint={`₹${done.importedTotal.toLocaleString('en-IN')} added. Your dashboard and analytics are already updated.`}
            action={
              <Link href="/expenses" className="btn btn-primary">
                View expenses
              </Link>
            }
          />
        </Card>
      )}

      <Card>
        <SectionTitle>1 · Choose your CSV</SectionTitle>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
        />
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn btn-primary" onClick={() => fileRef.current?.click()} disabled={busy}>
            Choose file
          </button>
          {fileName && <span className="muted text-sm truncate">{fileName}</span>}
        </div>

        <div className="mt-4 max-w-[14rem]">
          <label className="label">Year for dates like &ldquo;2-Aug&rdquo;</label>
          <input
            className="input tabular"
            inputMode="numeric"
            value={fallbackYear}
            onChange={(e) => setFallbackYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
            onBlur={() => csv && runPreview()}
          />
        </div>
      </Card>

      {error && (
        <Card>
          <p className="text-sm" style={{ color: 'var(--danger)' }}>
            {error}
          </p>
        </Card>
      )}

      {preview && (
        <>
          <Card>
            <SectionTitle>2 · Check the column mapping</SectionTitle>
            <p className="muted text-sm mb-4">
              Person columns must be marked <strong>Person</strong> — marking one as a category is what would double
              your totals.
            </p>
            <div className="space-y-2">
              {preview.mapping.map((m) => (
                <div key={m.header} className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium min-w-[9rem] truncate">{m.header}</span>
                  <div className="flex gap-1.5">
                    {ROLES.map((r) => (
                      <button
                        key={r}
                        className="chip capitalize text-xs"
                        data-selected={m.role === r}
                        onClick={() => setRole(m.header, r)}
                        disabled={busy}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                  {m.role !== 'ignore' && m.role !== 'date' && (
                    <span className="muted text-xs">→ {m.target}</span>
                  )}
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <SectionTitle>3 · Preview</SectionTitle>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
              <div>
                <p className="label">Transactions</p>
                <p className="text-xl font-semibold tabular">{preview.rows.length}</p>
              </div>
              <div>
                <p className="label">Reconstructed total</p>
                <p className="text-xl font-semibold tabular">₹{preview.computedTotal.toLocaleString('en-IN')}</p>
              </div>
              {preview.sheetTotal != null && (
                <div>
                  <p className="label">Sheet TOTAL column</p>
                  <p
                    className="text-xl font-semibold tabular"
                    style={{ color: totalsMatch ? 'var(--success)' : 'var(--danger)' }}
                  >
                    ₹{preview.sheetTotal.toLocaleString('en-IN')}
                  </p>
                </div>
              )}
            </div>

            {preview.sheetTotal != null && (
              <p
                className="text-sm mb-4 px-3 py-2 rounded-lg"
                style={{
                  background: 'var(--surface-2)',
                  color: totalsMatch ? 'var(--success)' : 'var(--danger)',
                }}
              >
                {totalsMatch
                  ? '✓ Reconstructed total matches your sheet exactly — nothing was double counted.'
                  : '⚠ Totals differ. Fix the column mapping above before importing.'}
              </p>
            )}

            {preview.warnings.length > 0 && (
              <details className="mb-4">
                <summary className="text-sm cursor-pointer muted">
                  {preview.warnings.length} warning{preview.warnings.length === 1 ? '' : 's'}
                </summary>
                <ul className="mt-2 space-y-1 text-xs muted list-disc pl-5">
                  {preview.warnings.slice(0, 30).map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </details>
            )}

            {preview.rows.length === 0 ? (
              <EmptyState icon="🤔" title="No transactions found" hint="Check that a DATE column is mapped." />
            ) : (
              <div className="scroll-x">
                <table className="w-full text-sm min-w-[32rem]">
                  <thead>
                    <tr className="muted text-xs text-left">
                      <th className="py-2 font-medium">Date</th>
                      <th className="py-2 font-medium">Category</th>
                      <th className="py-2 font-medium">Person</th>
                      <th className="py-2 font-medium text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y" style={{ borderColor: 'var(--border)' }}>
                    {preview.rows.slice(0, 40).map((r, i) => (
                      <tr key={i}>
                        <td className="py-2">{dayLabel(r.expenseDate)}</td>
                        <td className="py-2">{r.categoryName}</td>
                        <td className="py-2 muted">{r.personName ?? '—'}</td>
                        <td className="py-2 text-right tabular">₹{r.amount.toLocaleString('en-IN')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.rows.length > 40 && (
                  <p className="muted text-xs mt-3">…and {preview.rows.length - 40} more.</p>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 mt-5">
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setPreview(null);
                  setCsv('');
                  setFileName('');
                }}
              >
                Cancel
              </button>
              <button className="btn btn-primary" onClick={commit} disabled={busy || preview.rows.length === 0}>
                {busy ? 'Importing…' : `Import ${preview.rows.length} expenses`}
              </button>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
