import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { AuthForm } from '@/components/auth-form';

export default async function RegisterPage() {
  if (await getSession()) redirect('/');
  return <AuthForm mode="register" />;
}
