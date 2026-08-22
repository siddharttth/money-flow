'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import { api, RequestError } from '@/lib/client';

export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signupCode, setSignupCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isRegister = mode === 'register';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post(isRegister ? '/api/auth/register' : '/api/auth/login', {
        ...(isRegister ? { name, signupCode: signupCode || undefined } : {}),
        email,
        password,
      });
      router.push('/dashboard');
      router.refresh();
    } catch (err) {
      setError(err instanceof RequestError ? err.message : 'Something went wrong');
      setBusy(false);
    }
  }

  return (
    <div className="min-h-dvh app-grid flex items-center justify-center px-4 py-10 relative overflow-hidden">
      {/* The same soft blue glow the landing page uses. */}
      <div
        className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[min(560px,90vw)] h-[360px] rounded-full blur-[100px] pointer-events-none"
        style={{ background: 'var(--brass-soft)' }}
        aria-hidden
      />

      <div className="w-full max-w-sm relative z-10">
        <div className="text-center mb-8">
          <Link href="/" className="wordmark text-2xl inline-block mb-3" style={{ color: 'var(--brass)' }}>
            Money Flow
          </Link>
          <h1 className="text-xl font-bold mb-1.5">
            {isRegister ? 'Start your ledger' : 'Welcome back'}
          </h1>
          <p className="muted text-sm">
            {isRegister
              ? 'Track what you spent on, and who it was with.'
              : 'Pick up where your spreadsheet left off.'}
          </p>
        </div>

        <form onSubmit={submit} className="card p-6 space-y-4">
          {isRegister && (
            <div>
              <label className="label" htmlFor="name">
                Name
              </label>
              <input
                id="name"
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                required
              />
            </div>
          )}

          <div>
            <label className="label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              inputMode="email"
              required
            />
          </div>

          <div>
            <label className="label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              minLength={isRegister ? 8 : undefined}
              required
            />
            {isRegister && <p className="muted text-xs mt-1.5">At least 8 characters.</p>}
          </div>

          {isRegister && (
            <div>
              <label className="label" htmlFor="code">
                Signup code
              </label>
              <input
                id="code"
                className="input"
                value={signupCode}
                onChange={(e) => setSignupCode(e.target.value)}
                autoComplete="off"
                placeholder="Only if this deployment requires one"
              />
            </div>
          )}

          {error && (
            <p className="text-sm" style={{ color: 'var(--danger)' }} role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="btn btn-primary w-full" disabled={busy}>
            {busy ? 'Please wait…' : isRegister ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <p className="text-center text-sm muted mt-5">
          {isRegister ? 'Already have an account? ' : "Don't have an account? "}
          <Link href={isRegister ? '/login' : '/register'} style={{ color: 'var(--accent)' }} className="font-medium">
            {isRegister ? 'Sign in' : 'Create one'}
          </Link>
        </p>
      </div>
    </div>
  );
}
