import { redirect } from 'next/navigation';

/* Investments and goals were the same page wearing two names — a goal IS an
   investment category with a target. They live at /goals now. */
export default function InvestmentsRedirect() {
  redirect('/goals');
}
