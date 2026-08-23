'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { api } from '@/lib/client';
import { Modal, Toast } from './ui';
import { InspectorProvider } from './inspector';
import { CommandPalette } from './command-palette';
import { AddTransaction } from './add-transaction';
import type { Expense } from '@/lib/types';

/*
 * Categories now live inside Settings, and the old Peers screen merged into
 * People — a person and a peer were always the same entity, so two screens
 * meant two places to look for one contact.
 */
const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: '◎' },
  { href: '/expenses', label: 'Transactions', icon: '≡' },
  { href: '/people', label: 'People', icon: '☺' },
  { href: '/analytics', label: 'Analytics', icon: '◑' },
  { href: '/settings', label: 'Settings', icon: '⚙' },
];

const MOBILE_PRIMARY = ['/dashboard', '/expenses', '/people'];
const MORE_ITEMS = ['/analytics', '/settings'];

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
      if (e.key === 'n') {
        e.preventDefault();
        openAdd();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openAdd]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  async function logout() {
    await api.post('/api/auth/logout');
    router.push('/login');
    router.refresh();
  }

  return (
    <Ctx.Provider value={{ openAdd, toast }}>
      <InspectorProvider>
      <div className="flex min-h-dvh">
        {/* Desktop sidebar */}
        <aside
          /*
           * Fixed rather than sticky. `overflow-x: hidden` on <html> (needed so
           * a stray wide element can never scroll the page sideways) silently
           * disables position:sticky for every descendant, so the sidebar used
           * to scroll away with the page. Fixed is immune to that, and the
           * content column is offset by the same width below.
           */
          className="hidden lg:flex flex-col w-60 fixed left-0 top-0 bottom-0 z-40 border-r px-3 py-5 overflow-y-auto"
          style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
        >
          <Link href="/dashboard" className="flex items-center gap-2 px-2 mb-6">
            <span aria-hidden style={{ width: 4, height: 20, background: 'var(--brass)', borderRadius: 99 }} />
            <span className="wordmark text-lg" style={{ color: 'var(--brass)' }}>Money Flow</span>
          </Link>

          <button className="btn btn-primary mb-2" onClick={() => openAdd()}>
            + Add transaction
          </button>
          <button
            className="flex items-center justify-between gap-2 mb-5 px-3.5 py-2 rounded-full text-xs transition-colors"
            style={{ background: 'var(--surface-2)', color: 'var(--text-muted)', transitionDuration: '150ms' }}
            onClick={() => {
              const ev = new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true });
              window.dispatchEvent(ev);
            }}
          >
            <span>Search…</span>
            <kbd className="font-mono text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--surface)' }}>
              ⌘K
            </kbd>
          </button>

          <nav className="flex flex-col gap-0.5">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 px-3.5 py-2.5 rounded-full text-sm font-semibold transition-colors"
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

        <div className="flex-1 min-w-0 flex flex-col lg:ml-60">
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
            <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
              <span className="wordmark text-lg" style={{ color: 'var(--brass)' }}>
                Money Flow
              </span>
            </Link>
          </header>

          <main className="flex-1 w-full app-grid">
            <div className="px-4 sm:px-6 py-5 pb-28 lg:pb-8 max-w-5xl w-full mx-auto">{children}</div>
          </main>
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
                className="w-14 h-14 -mt-6 rounded-full text-2xl font-light flex items-center justify-center"
                style={{
                  background: 'var(--brass)',
                  color: 'var(--on-brass)',
                  boxShadow: '0 12px 28px -8px rgba(64, 86, 244, 0.55)',
                }}
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
        title={editing ? 'Edit expense' : 'Add transaction'}
        wide
      >
        <AddTransaction
          key={editing?.id ?? 'new'}
          existing={editing}
          onSaved={(msg, keepOpen) => {
            toast(msg);
            if (!keepOpen) setAddOpen(false);
          }}
        />
      </Modal>

      <CommandPalette onAdd={() => openAdd()} />

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
      </InspectorProvider>
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
