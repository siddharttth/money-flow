'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { api } from '@/lib/client';
import { Modal, Toast } from './ui';
import { Logo } from './logo';
import { InspectorProvider } from './inspector';
import { CommandPalette } from './command-palette';
import { AddTransaction } from './add-transaction';
import { NavIcon, type NavIconKey } from './icons';
import type { Expense } from '@/lib/types';

/*
 * Categories live inside Settings, and the old Peers screen merged into
 * People — a person and a peer were always the same entity, so two screens
 * meant two places to look for one contact.
 */
const NAV: { href: string; label: string; short: string; icon: NavIconKey }[] = [
  { href: '/dashboard', label: 'Dashboard', short: 'Home', icon: 'dashboard' },
  { href: '/expenses', label: 'Transactions', short: 'Ledger', icon: 'ledger' },
  { href: '/people', label: 'People', short: 'People', icon: 'people' },
  { href: '/analytics', label: 'Analytics', short: 'Insights', icon: 'analytics' },
  { href: '/settings', label: 'Settings', short: 'Settings', icon: 'settings' },
];

/** The two that flank the + on a phone, in thumb order. */
const MOBILE_LEFT = ['/dashboard', '/expenses'];
const MOBILE_RIGHT = ['/people', '/analytics'];

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

  // Desktop shortcut: "n" anywhere outside an input opens Add transaction.
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

  const openSearch = () =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }));

  return (
    <Ctx.Provider value={{ openAdd, toast }}>
      <InspectorProvider>
        <div className="flex min-h-dvh">
          {/*
           * Fixed, not sticky. The page is `overflow-x: clip`, which no longer
           * breaks sticky, but a fixed rail is still the honest description:
           * it does not participate in the content column's scroll at all.
           */}
          <aside
            className="hidden lg:flex flex-col w-[15rem] fixed left-0 top-0 bottom-0 z-40 border-r px-3 py-5 overflow-y-auto"
            style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
          >
            <Link href="/dashboard" className="flex items-center px-2 mb-7" aria-label="Money Flow home">
              <Logo height={22} />
            </Link>

            <button className="btn btn-primary w-full mb-2" onClick={() => openAdd()}>
              <NavIcon name="plus" size={16} />
              Add transaction
            </button>

            <button
              className="flex items-center justify-between gap-2 mb-6 px-3.5 h-9 rounded-full text-xs transition-colors"
              style={{ background: 'var(--surface-2)', color: 'var(--text-muted)', transitionDuration: '150ms' }}
              onClick={openSearch}
            >
              <span>Search…</span>
              <kbd
                className="font-mono text-[10px] px-1.5 py-0.5 rounded"
                style={{ background: 'var(--surface)', color: 'var(--text-muted)' }}
              >
                ⌘K
              </kbd>
            </button>

            <nav className="flex flex-col gap-0.5">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive(item.href) ? 'page' : undefined}
                  className="flex items-center gap-3 px-3 h-10 rounded-lg text-[13.5px] font-semibold transition-colors"
                  style={
                    isActive(item.href)
                      ? { background: 'var(--accent-soft)', color: 'var(--accent)' }
                      : { color: 'var(--text-muted)' }
                  }
                >
                  <NavIcon name={item.icon} size={18} />
                  {item.label}
                </Link>
              ))}
            </nav>

            <div className="mt-auto pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
              <p className="text-[13px] font-semibold truncate px-3">{user.name}</p>
              <p className="muted text-[11px] truncate px-3 mt-0.5">{user.email}</p>
              <button onClick={logout} className="muted text-[11px] px-3 mt-2 hover:underline">
                Sign out
              </button>
            </div>
          </aside>

          <div className="flex-1 min-w-0 flex flex-col lg:ml-[15rem]">
            {/* Mobile header. Genuinely sticky now that the page is not a
                scroll container — see overflow-x: clip in globals.css. */}
            <header
              className="lg:hidden sticky top-0 z-30 flex items-center justify-between gap-3 px-4 h-14 border-b"
              style={{
                borderColor: 'var(--border)',
                background: 'color-mix(in srgb, var(--bg) 86%, transparent)',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                paddingTop: 'env(safe-area-inset-top)',
                height: 'calc(3.5rem + env(safe-area-inset-top))',
              }}
            >
              <Link href="/dashboard" aria-label="Money Flow home" className="flex items-center h-11 pr-3 -my-1">
                <Logo height={19} />
              </Link>
              <div className="flex items-center -mr-2">
                <button
                  onClick={openSearch}
                  aria-label="Search"
                  className="w-11 h-11 flex items-center justify-center rounded-full"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden>
                    <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="2" />
                    <path d="M16 16l4.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </button>
                <Link
                  href="/settings"
                  aria-label="Settings"
                  className="w-11 h-11 flex items-center justify-center rounded-full"
                  style={{ color: isActive('/settings') ? 'var(--accent)' : 'var(--text-muted)' }}
                >
                  <NavIcon name="settings" size={19} />
                </Link>
              </div>
            </header>

            <main className="flex-1 w-full app-grid">
              <div className="px-4 sm:px-6 lg:px-8 py-5 sm:py-7 pb-32 lg:pb-10 max-w-6xl w-full mx-auto">
                {children}
              </div>
            </main>
          </div>

          {/* Mobile bottom nav, + as the centre action. */}
          <nav
            className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t safe-bottom"
            style={{
              borderColor: 'var(--border)',
              background: 'color-mix(in srgb, var(--surface) 92%, transparent)',
              backdropFilter: 'blur(14px)',
              WebkitBackdropFilter: 'blur(14px)',
            }}
          >
            <div className="grid grid-cols-5 items-center max-w-lg mx-auto">
              {MOBILE_LEFT.map((href) => {
                const item = NAV.find((n) => n.href === href)!;
                return <MobileTab key={href} {...item} active={isActive(href)} />;
              })}

              <div className="flex justify-center">
                <button
                  onClick={() => openAdd()}
                  aria-label="Add transaction"
                  className="w-14 h-14 -mt-7 rounded-full flex items-center justify-center active:scale-95 transition-transform"
                  style={{
                    background: 'var(--brass)',
                    color: 'var(--on-brass)',
                    border: '3px solid var(--bg)',
                    boxShadow: '0 10px 24px -10px color-mix(in oklab, var(--brass) 70%, transparent)',
                    transitionDuration: '80ms',
                  }}
                >
                  <NavIcon name="plus" size={24} />
                </button>
              </div>

              {MOBILE_RIGHT.map((href) => {
                const item = NAV.find((n) => n.href === href)!;
                return <MobileTab key={href} {...item} active={isActive(href)} />;
              })}
            </div>
          </nav>
        </div>

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
  short,
  icon,
  active,
}: {
  href: string;
  short: string;
  icon: NavIconKey;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className="flex flex-col items-center justify-center gap-1 h-14 text-[10px] font-semibold tracking-wide"
      style={{ color: active ? 'var(--accent)' : 'var(--text-muted)' }}
    >
      <NavIcon name={icon} size={20} />
      {short}
    </Link>
  );
}
