import { redirect } from 'next/navigation';

/** Peers merged into People — a peer and a contact were always one entity. */
export default function PeersRedirect() {
  redirect('/people');
}
