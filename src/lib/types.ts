export type Category = {
  id: string;
  name: string;
  slug: string;
  icon: string;
  color: string;
  kind: string;
  isActive: boolean;
  sortOrder: number;
  usageCount?: number;
};

export type Person = {
  id: string;
  name: string;
  relationshipType: string;
  avatar: string;
  color: string;
  isSelf: boolean;
  isActive: boolean;
  sortOrder: number;
  usageCount?: number;
};

export type Group = {
  id: string;
  name: string;
  icon: string;
  members: { id: string; name: string; avatar: string; color: string }[];
};

export type Expense = {
  id: string;
  amount: number;
  amountMinor: number;
  expenseDate: string;
  note: string | null;
  paymentMethod: string | null;
  category: { id: string; name: string; icon: string; color: string; kind: string };
  people: { id: string; name: string; avatar: string; color: string }[];
  createdAt: string;
  updatedAt: string;
};

export type ExpenseList = { items: Expense[]; total: number; totalMinor: number };

export type CategoryStat = {
  categoryId: string;
  name: string;
  slug: string;
  icon: string;
  color: string;
  kind: string;
  totalMinor: number;
  count: number;
  share: number;
};

export type PersonStat = {
  personId: string;
  name: string;
  avatar: string;
  color: string;
  relationshipType: string;
  isSelf: boolean;
  totalMinor: number;
  count: number;
};

export type Summary = {
  month: string;
  totalMinor: number;
  transactionCount: number;
  todayMinor: number;
  weekMinor: number;
  avgDailyMinor: number;
  previousMonth: { month: string; totalMinor: number };
  changePct: number | null;
  topCategory: CategoryStat | null;
  topDay: { date: string; totalMinor: number } | null;
  daysWithSpending: number;
  activeDays: number;
};
