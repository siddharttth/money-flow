import {
  pgTable,
  text,
  integer,
  timestamp,
  boolean,
  date,
  uuid,
  index,
  uniqueIndex,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

/**
 * MONEY REPRESENTATION
 * --------------------
 * Every amount is stored as an INTEGER number of paise (minor units).
 * ₹800.50 -> 80050. This keeps every SUM()/GROUP BY exact — no float drift.
 * The API layer converts to/from decimal rupees at the boundary only.
 */

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  passwordHash: text('password_hash').notNull(),
  currency: text('currency').notNull().default('INR'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  emailUnique: uniqueIndex('users_email_unique').on(t.email),
}));

/**
 * Categories = WHAT the money was spent on.
 * User scoped so each account can rename/add/reorder freely.
 * `kind` lets INVESTMENT be visually/analytically distinguished from
 * consumption without needing a schema change later.
 */
export const categories = pgTable('categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  icon: text('icon').notNull().default('💸'),
  color: text('color').notNull().default('#6366f1'),
  kind: text('kind').notNull().default('expense'), // 'expense' | 'investment'
  /** Optional monthly cap, in paise. Null means the category is untracked. */
  monthlyBudgetMinor: integer('monthly_budget_minor'),
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userSlugUnique: uniqueIndex('categories_user_slug_unique').on(t.userId, t.slug),
  userIdx: index('categories_user_idx').on(t.userId),
}));

/**
 * People = WHO the expense was associated with.
 * Completely independent of category. `isSelf` marks the first-class "Me"
 * person so "how much did I spend on myself" is a real query, not a NULL check.
 */
export const people = pgTable('people', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  relationshipType: text('relationship_type').notNull().default('other'), // self|family|friend|other
  avatar: text('avatar').notNull().default('🙂'),
  color: text('color').notNull().default('#0ea5e9'),
  isSelf: boolean('is_self').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userIdx: index('people_user_idx').on(t.userId),
  userNameUnique: uniqueIndex('people_user_name_unique').on(t.userId, t.name),
}));

export const groups = pgTable('groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  icon: text('icon').notNull().default('👥'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userIdx: index('groups_user_idx').on(t.userId),
}));

/** A person may belong to many groups; a group holds many people. */
export const groupMembers = pgTable('group_members', {
  groupId: uuid('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
  personId: uuid('person_id').notNull().references(() => people.id, { onDelete: 'cascade' }),
}, (t) => ({
  pk: primaryKey({ columns: [t.groupId, t.personId] }),
  personIdx: index('group_members_person_idx').on(t.personId),
}));

/**
 * THE single source of truth for money.
 * One real-world expense == exactly one row here. Nothing else holds an amount
 * that counts toward total spending. All analytics are derived from this table.
 */
export const expenses = pgTable('expenses', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  amountMinor: integer('amount_minor').notNull(), // paise
  categoryId: uuid('category_id').notNull().references(() => categories.id, { onDelete: 'restrict' }),
  expenseDate: date('expense_date').notNull(), // 'YYYY-MM-DD', no timezone games
  note: text('note'),
  // Future-ready columns (unused by the V1 UI, cost nothing today):
  paymentMethod: text('payment_method'), // cash | upi | card | ...
  source: text('source').notNull().default('manual'), // manual | import | recurring
  importBatchId: uuid('import_batch_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }), // soft delete
}, (t) => ({
  userDateIdx: index('expenses_user_date_idx').on(t.userId, t.expenseDate),
  userCategoryIdx: index('expenses_user_category_idx').on(t.userId, t.categoryId),
  liveIdx: index('expenses_live_idx').on(t.userId, t.deletedAt, t.expenseDate),
  batchIdx: index('expenses_import_batch_idx').on(t.importBatchId),
}));

/**
 * Who an expense was shared with, and for how much.
 *
 * `shareAmountMinor` stays NULL for an even split — the share is then derived
 * as amount ÷ participants, with the remainder allocated to the paisa, so a
 * ₹75 dinner with three people puts ₹25 against each. Filling the column in
 * overrides that for an unequal split; nothing else has to change, which is
 * why it has been here since the first migration.
 *
 * Analytics NEVER sum this table to produce total spending — the grand total
 * comes from `expenses` alone. Shares partition that total; they do not
 * create it.
 */
export const expensePeople = pgTable('expense_people', {
  expenseId: uuid('expense_id').notNull().references(() => expenses.id, { onDelete: 'cascade' }),
  personId: uuid('person_id').notNull().references(() => people.id, { onDelete: 'cascade' }),
  shareAmountMinor: integer('share_amount_minor'), // nullable — future split support
}, (t) => ({
  pk: primaryKey({ columns: [t.expenseId, t.personId] }),
  personIdx: index('expense_people_person_idx').on(t.personId),
}));

/**
 * PEER LEDGER — money lent and borrowed. Deliberately NOT an expense.
 *
 * Lending someone ₹1,000 is not spending: you expect it back, so it must never
 * touch expense totals or category analytics. Borrowing is not income either.
 * Hence a separate table that no spending query ever reads.
 *
 * Two directions cover every case in the old PEERS sheet:
 *   'out' — money left you toward this person (gave / lent / paid on their behalf)
 *   'in'  — money came to you from them (took / borrowed / got repaid)
 *
 * balance = SUM(out) - SUM(in)
 *   > 0  they owe you   (the sheet's GIVEN column)
 *   < 0  you owe them   (the sheet's TAKEN column)
 *
 * A repayment is just an entry in the opposite direction, so the running
 * balance settles itself without any special "settlement" concept.
 */
export const ledgerEntries = pgTable('ledger_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  personId: uuid('person_id').notNull().references(() => people.id, { onDelete: 'cascade' }),
  direction: text('direction').notNull(), // 'out' | 'in'
  amountMinor: integer('amount_minor').notNull(), // paise, always positive
  entryDate: date('entry_date').notNull(),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (t) => ({
  userPersonIdx: index('ledger_user_person_idx').on(t.userId, t.personId),
  userDateIdx: index('ledger_user_date_idx').on(t.userId, t.entryDate),
  liveIdx: index('ledger_live_idx').on(t.userId, t.deletedAt),
}));

export const ledgerEntriesRelations = relations(ledgerEntries, ({ one }) => ({
  user: one(users, { fields: [ledgerEntries.userId], references: [users.id] }),
  person: one(people, { fields: [ledgerEntries.personId], references: [people.id] }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  categories: many(categories),
  people: many(people),
  expenses: many(expenses),
  groups: many(groups),
  ledgerEntries: many(ledgerEntries),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  user: one(users, { fields: [categories.userId], references: [users.id] }),
  expenses: many(expenses),
}));

export const peopleRelations = relations(people, ({ one, many }) => ({
  user: one(users, { fields: [people.userId], references: [users.id] }),
  expenseLinks: many(expensePeople),
  groupLinks: many(groupMembers),
}));

export const groupsRelations = relations(groups, ({ one, many }) => ({
  user: one(users, { fields: [groups.userId], references: [users.id] }),
  members: many(groupMembers),
}));

export const groupMembersRelations = relations(groupMembers, ({ one }) => ({
  group: one(groups, { fields: [groupMembers.groupId], references: [groups.id] }),
  person: one(people, { fields: [groupMembers.personId], references: [people.id] }),
}));

export const expensesRelations = relations(expenses, ({ one, many }) => ({
  user: one(users, { fields: [expenses.userId], references: [users.id] }),
  category: one(categories, { fields: [expenses.categoryId], references: [categories.id] }),
  participants: many(expensePeople),
}));

export const expensePeopleRelations = relations(expensePeople, ({ one }) => ({
  expense: one(expenses, { fields: [expensePeople.expenseId], references: [expenses.id] }),
  person: one(people, { fields: [expensePeople.personId], references: [people.id] }),
}));

export type User = typeof users.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Person = typeof people.$inferSelect;
export type Group = typeof groups.$inferSelect;
export type Expense = typeof expenses.$inferSelect;
export type LedgerEntry = typeof ledgerEntries.$inferSelect;
