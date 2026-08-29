import { redirect } from 'next/navigation';

/**
 * The standalone peer page is gone. Its whole job — a person's spending, their
 * running balance and every ledger entry with them — is what the inspector
 * drawer shows now, from any row on any screen. Nothing in the app linked here
 * any more, and the page was the last place still using the old "I gave / I
 * got" wording. Old links land on People rather than a 404.
 */
export default function PeerDetailRedirect() {
  redirect('/people');
}
