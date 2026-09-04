'use client';

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Toast } from './ui';

/**
 * Toasts live here rather than in the shell.
 *
 * The shell renders the inspector, so anything inside the inspector reaching
 * back into the shell for `toast()` would close an import cycle between the
 * two. It works — the call happens at render, long after both modules have
 * evaluated — but it is the kind of thing that breaks silently later when a
 * bundler decides to evaluate them in the other order.
 *
 * One small module both can import, and no cycle.
 */

export type ToastAction = { label: string; onClick: () => void };

type ToastFn = (message: string, tone?: 'success' | 'error', action?: ToastAction) => void;

const Ctx = createContext<ToastFn>(() => {});

export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<{
    text: string;
    tone: 'success' | 'error';
    action?: ToastAction;
  } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toast = useCallback<ToastFn>((text, tone = 'success', action) => {
    if (timer.current) clearTimeout(timer.current);
    setCurrent({ text, tone, action });
    // An undoable toast sticks around longer — 2.6s is not enough to react to.
    timer.current = setTimeout(() => setCurrent(null), action ? 6000 : 2600);
  }, []);

  return (
    <Ctx.Provider value={toast}>
      {children}
      {current && (
        <Toast
          message={current.text}
          tone={current.tone}
          action={
            current.action && {
              label: current.action.label,
              onClick: () => {
                current.action!.onClick();
                setCurrent(null);
              },
            }
          }
        />
      )}
    </Ctx.Provider>
  );
}
