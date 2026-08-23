import { redirect } from 'next/navigation';

/** Categories are configuration, so they now live inside Settings. */
export default function CategoriesRedirect() {
  redirect('/settings');
}
