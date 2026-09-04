import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { AppShell } from '@/components/app-shell';
import { Providers } from '@/components/providers';
import { ToastProvider } from '@/components/toast';

/**
 * Every authenticated page renders through here, so the session check happens
 * server-side once — no protected page can render without a valid session.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');

  return (
    <Providers>
      {/* Above the shell so the shell and everything it renders share one. */}
      <ToastProvider>
        <AppShell user={{ name: session.name, email: session.email }}>{children}</AppShell>
      </ToastProvider>
    </Providers>
  );
}
