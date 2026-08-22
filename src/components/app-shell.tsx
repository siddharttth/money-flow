'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { api } from '@/lib/client';
import { Modal, Toast } from './ui';
import { ExpenseForm } from './expense-form';
import type { Expense } from '@/lib/types';

const NAV = [
  { href: '/', label: 'Dashboard', icon: '◎' },
  { href: '/expenses', label: 'Expenses', icon: '≡' },
  { href: '/peers', label: 'Peers', icon: '⇄' },
  { href: '/people', label: 'People', icon: '☺' },
  { href: '/analytics', label: 'Analytics', icon: '◑' },
  { href: '/categories', label: 'Categories', icon: '◈' },
  { href: '/settings', label: 'Settings', icon: '⚙' },
];

// Only four fit either side of the + button, so the rest live behind "More".
const MOBILE_PRIMARY = ['/', '/expenses', '/peers'];
const MORE_ITEMS = ['/people', '/analytics', '/categories', '/settings'];

type ToastAction = { label: string; onClick: () => void };

type ShellCtx = {
  openAdd: (existing?: Expense) => void;
  toast: (message: string, tone?: 'success' | 'error', action?: ToastAction) => void;
};

const Ctx = createContext<ShellCtx>({ openAdd: () => {}, toast: () => {} });

export const useShell = () => useContext(Ctx);

export function AppShell({ user, children }: { user: { name: string; email: string }; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | undefined>();
  const [toastMsg, setToastMsg] = useState<{
    text: string;
    tone: 'success' | 'error';
    action?: ToastAction;
  } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toast = useCallback((text: string, tone: 'success' | 'error' = 'success', action?: ToastAction) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastMsg({ text, tone, action });
    // An undoable toast sticks around longer — 2.6s is not enough to react to.
    toastTimer.current = setTimeout(() => setToastMsg(null), action ? 6000 : 2600);
  }, []);

  const openAdd = useCallback((existing?: Expense) => {
    setEditing(existing);
    setAddOpen(true);
  }, []);

  // Desktop shortcut: "n" (or "a") anywhere outside an input opens Add Expense.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'n' || e.key === 'a') {
        e.preventDefault();
        openAdd();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openAdd]);

  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  async function logout() {
    await api.post('/api/auth/logout');
    router.push('/login');
    router.refresh();
  }

  return (
    <Ctx.Provider value={{ openAdd, toast }}>
      <div className="flex min-h-dvh">
        {/* Desktop sidebar */}
        <aside
          className="hidden lg:flex flex-col w-60 shrink-0 border-r px-3 py-5 sticky top-0 h-dvh"
          style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
        >
          <Link href="/" className="flex items-center gap-2 px-2 mb-6">
            <span className="text-xl">💸</span>
            <span className="font-semibold">Money Flow</span>
          </Link>

          <button className="btn btn-primary mb-5" onClick={() => openAdd()}>
            + Add Expense
          </button>

          <nav className="flex flex-col gap-0.5">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors"
                style={
                  isActive(item.href)
                    ? { background: 'var(--accent-soft)', color: 'var(--accent)' }
                    : { color: 'var(--text-muted)' }
                }
              >
                <span aria-hidden className="w-4 text-center">
                  {item.icon}
                </span>
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="mt-auto pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
            <p className="text-sm font-medium truncate px-3">{user.name}</p>
            <p className="muted text-xs truncate px-3">{user.email}</p>
            <button onClick={logout} className="muted text-xs px-3 mt-2 hover:underline">
              Sign out
            </button>
          </div>
        </aside>

        <div className="flex-1 min-w-0 flex flex-col">
          {/* Mobile header */}
          <header
            className="lg:hidden sticky top-0 z-30 flex items-center justify-between px-4 py-3 border-b"
            style={{
              borderColor: 'var(--border)',
              background: 'color-mix(in srgb, var(--surface) 88%, transparent)',
              backdropFilter: 'blur(8px)',
              paddingTop: 'max(env(safe-area-inset-top), 0.75rem)',
            }}
          >
            <Link href="/" className="flex items-center gap-2 font-semibold">
              <span>💸</span> Money Flow
            </Link>
          </header>

          <main className="flex-1 px-4 sm:px-6 py-5 pb-28 lg:pb-8 max-w-5xl w-full mx-auto">{children}</main>
        </div>

        {/* Mobile bottom nav with the + as the centre action */}
        <nav
          className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t safe-bottom"
          style={{
            borderColor: 'var(--border)',
            background: 'color-mix(in srgb, var(--surface) 92%, transparent)',
            backdropFilter: 'blur(12px)',
          }}
        >
          <div className="grid grid-cols-5 items-center">
            {NAV.filter((n) => MOBILE_PRIMARY.includes(n.href))
              .slice(0, 2)
              .map((item) => (
                <MobileTab key={item.href} {...item} active={isActive(item.href)} />
              ))}

            <div className="flex justify-center">
              <button
                onClick={() => openAdd()}
                aria-label="Add expense"
                className="w-14 h-14 -mt-6 rounded-full text-white text-2xl font-light shadow-lg flex items-center justify-center"
                style={{ background: 'var(--accent)' }}
              >
                +
              </button>
            </div>

            {NAV.filter((n) => MOBILE_PRIMARY.includes(n.href))
              .slice(2)
              .map((item) => (
                <MobileTab key={item.href} {...item} active={isActive(item.href)} />
              ))}

            <button
              onClick={() => setMoreOpen(true)}
              className="flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium"
              style={{ color: MORE_ITEMS.some((h) => isActive(h)) ? 'var(--accent)' : 'var(--text-muted)' }}
            >
              <span aria-hidden className="text-lg leading-none">
                ⋯
              </span>
              More
            </button>
          </div>
        </nav>
      </div>

      <Modal open={moreOpen} onClose={() => setMoreOpen(false)} title="More">
        <div className="grid grid-cols-2 gap-2">
          {NAV.filter((n) => MORE_ITEMS.includes(n.href)).map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMoreOpen(false)}
              className="btn btn-ghost justify-start"
              style={isActive(item.href) ? { background: 'var(--accent-soft)', color: 'var(--accent)' } : undefined}
            >
              <span aria-hidden>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </div>
        <button className="btn btn-danger w-full mt-3" onClick={logout}>
          Sign out
        </button>
      </Modal>

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title={editing ? 'Edit expense' : 'Add expense'}
        wide
      >
        <ExpenseForm
          key={editing?.id ?? 'new'}
          existing={editing}
          keepOpenAfterSave={!editing}
          onSaved={(_e, again) => {
            toast(editing ? 'Expense updated' : 'Expense saved');
            if (!again) setAddOpen(false);
          }}
        />
      </Modal>

      {toastMsg && (
        <Toast
          message={toastMsg.text}
          tone={toastMsg.tone}
          action={
            toastMsg.action && {
              label: toastMsg.action.label,
              onClick: () => {
                toastMsg.action!.onClick();
                setToastMsg(null);
              },
            }
          }
        />
      )}
    </Ctx.Provider>
  );
}

function MobileTab({
  href,
  label,
  icon,
  active,
}: {
  href: string;
  label: string;
  icon: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium"
      style={{ color: active ? 'var(--accent)' : 'var(--text-muted)' }}
    >
      <span aria-hidden className="text-lg leading-none">
        {icon}
      </span>
      {label}
    </Link>
  );
}
