'use client';

/** Thin fetch wrapper — every client call goes through here so error shapes
 *  and the 401 -> /login redirect are handled in exactly one place. */

export class RequestError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });

  if (res.status === 401 && typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
    window.location.href = '/login';
    throw new RequestError(401, 'Not authenticated');
  }

  const text = await res.text();
  const body = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const details = body?.details;
    const firstFieldError =
      details && typeof details === 'object'
        ? (Object.values(details as Record<string, string[]>)[0] ?? [])[0]
        : undefined;
    throw new RequestError(res.status, firstFieldError || body?.error || 'Something went wrong', details);
  }

  return body as T;
}

export const fetcher = <T,>(url: string) => request<T>(url);

export const api = {
  get: <T,>(url: string) => request<T>(url),
  post: <T,>(url: string, body?: unknown) =>
    request<T>(url, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  patch: <T,>(url: string, body: unknown) =>
    request<T>(url, { method: 'PATCH', body: JSON.stringify(body) }),
  del: <T,>(url: string) => request<T>(url, { method: 'DELETE' }),
};

/** Builds a querystring, dropping empty values so URLs stay stable for SWR keys. */
export function qs(params: Record<string, string | number | string[] | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === '') continue;
    sp.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}
