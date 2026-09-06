import { redirect } from 'next/navigation';

/* Analytics split into two pages by time horizon. The bare route lands on the
   month, which is what anyone typing /analytics is looking for. */
export default function AnalyticsIndex() {
  redirect('/analytics/month');
}
