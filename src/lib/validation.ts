import { z } from 'zod';
import { isValidISODate } from './dates';

const isoDate = z.string().refine(isValidISODate, 'Date must be a valid YYYY-MM-DD');

/** Amount in rupees: required, > 0, at most 2 decimal places, sane upper bound. */
const amount = z
  .number({ invalid_type_error: 'Amount must be a number' })
  .finite('Amount must be a number')
  .positive('Amount must be greater than 0')
  .max(100_000_000, 'Amount is unrealistically large')
  .refine((v) => Math.round(v * 100) === Number((v * 100).toFixed(4)), 'Amount supports at most 2 decimals');

export const registerSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
  signupCode: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});

export const createExpenseSchema = z.object({
  amount,
  categoryId: z.string().uuid('Pick a category'),
  expenseDate: isoDate,
  note: z.string().trim().max(500).optional().nullable(),
  personIds: z.array(z.string().uuid()).max(20).optional().default([]),
  paymentMethod: z.string().trim().max(32).optional().nullable(),
});

export const updateExpenseSchema = z.object({
  amount: amount.optional(),
  categoryId: z.string().uuid().optional(),
  expenseDate: isoDate.optional(),
  note: z.string().trim().max(500).optional().nullable(),
  personIds: z.array(z.string().uuid()).max(20).optional(),
  paymentMethod: z.string().trim().max(32).optional().nullable(),
});

export const createCategorySchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(60),
  icon: z.string().trim().max(8).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color must be a hex value').optional(),
  kind: z.enum(['expense', 'investment']).optional(),
  sortOrder: z.number().int().optional(),
});

export const updateCategorySchema = createCategorySchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const reorderSchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
});

export const createPersonSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(60),
  relationshipType: z.enum(['self', 'family', 'friend', 'other']).optional(),
  avatar: z.string().trim().max(8).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  groupIds: z.array(z.string().uuid()).optional(),
});

export const updatePersonSchema = createPersonSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const createGroupSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(60),
  icon: z.string().trim().max(8).optional(),
  personIds: z.array(z.string().uuid()).optional().default([]),
});

export const updateGroupSchema = createGroupSchema.partial();

export const createLedgerSchema = z.object({
  personId: z.string().uuid('Pick a person'),
  direction: z.enum(['out', 'in'], { errorMap: () => ({ message: 'Choose gave or got' }) }),
  amount,
  entryDate: isoDate,
  note: z.string().trim().max(500).optional().nullable(),
});

export const updateLedgerSchema = createLedgerSchema.partial();

export const importCommitSchema = z.object({
  rows: z.array(
    z.object({
      amount,
      categoryName: z.string().trim().min(1),
      expenseDate: isoDate,
      personName: z.string().trim().optional().nullable(),
      note: z.string().trim().max(500).optional().nullable(),
    }),
  ).min(1, 'Nothing to import').max(5000, 'Import at most 5000 rows at a time'),
  createMissing: z.boolean().optional().default(true),
});

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;
