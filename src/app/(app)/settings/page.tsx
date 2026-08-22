'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { api } from '@/lib/client';
import { Card, SectionTitle } from '@/components/ui';
import { useShell } from '@/components/app-shell';

export default function SettingsPage() {
  const { toast } = useShell();
  const { data } = useSWR<{ user: { name: string; email: string; currency: string } }>('/api/auth/me');
  const [theme, setTheme] = useState<'system' | 'light' | 'dark'>('system');

  useEffect(() => {
    try {
      setTheme((localStorage.getItem('mf-theme') as 'light' | 'dark') ?? 'system');
    } catch {
      /* storage unavailable — stay on system */
    }
  }, []);

  function applyTheme(next: 'system' | 'light' | 'dark') {
    setTheme(next);
    try {
      if (next === 'system') {
        localStorage.removeItem('mf-theme');
        document.documentElement.removeAttribute('data-theme');
      } else {
        localStorage.setItem('mf-theme', next);
        document.documentElement.setAttribute('data-theme', next);
      }
    } catch {
      /* ignore */
    }
  }

  function exportCsv() {
    // Straight navigation — the route streams a CSV with a download header.
    window.location.href = '/api/export';
    toast('Preparing your export…');
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold">Settings</h1>
        <p className="muted text-sm">Your account and data</p>
      </div>

      <Card>
        <SectionTitle>Account</SectionTitle>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="muted">Name</dt>
            <dd className="font-medium truncate">{data?.user.name ?? '—'}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="muted">Email</dt>
            <dd className="font-medium truncate">{data?.user.email ?? '—'}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="muted">Currency</dt>
            <dd className="font-medium">₹ {data?.user.currency ?? 'INR'}</dd>
          </div>
        </dl>
      </Card>

      <Card>
        <SectionTitle>Appearance</SectionTitle>
        <div className="flex gap-2">
          {(['system', 'light', 'dark'] as const).map((t) => (
            <button key={t} className="chip capitalize" data-selected={theme === t} onClick={() => applyTheme(t)}>
              {t}
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <SectionTitle>Manage</SectionTitle>
        <div className="grid sm:grid-cols-2 gap-3">
          <Link href="/categories" className="btn btn-ghost justify-start">
            ◈ Categories
          </Link>
          <Link href="/people" className="btn btn-ghost justify-start">
            ☺ People &amp; groups
          </Link>
        </div>
      </Card>

      <Card>
        <SectionTitle>Data</SectionTitle>
        <div className="grid sm:grid-cols-2 gap-3">
          <Link href="/settings/import" className="btn btn-ghost justify-start">
            ↥ Import from Google Sheet
          </Link>
          <button className="btn btn-ghost justify-start" onClick={exportCsv}>
            ↧ Export all expenses (CSV)
          </button>
        </div>
        <p className="muted text-xs mt-3">
          The export has one row per real transaction — date, amount, category, people and note.
        </p>
      </Card>

      <Card>
        <SectionTitle>Session</SectionTitle>
        <button
          className="btn btn-danger"
          onClick={async () => {
            await api.post('/api/auth/logout');
            window.location.href = '/login';
          }}
        >
          Sign out
        </button>
      </Card>
    </div>
  );
}
