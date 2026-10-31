import { z } from 'zod';

export const MAX_MONEY = 1_000_000_000_000;
export const minor = z.number().int().safe().min(0).max(MAX_MONEY);
export const positiveMinor = minor.min(1);
export const signedMinor = z.number().int().safe().min(-MAX_MONEY).max(MAX_MONEY);
export const idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === v;
  }, 'Use a valid YYYY-MM-DD date');
export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const text = z.string().trim().min(1).max(120);
const timestamp = z.string().datetime();
const base = { id: idSchema, created_at: timestamp };
export const accountInput = z
  .object({
    name: text,
    type: z.enum(['savings', 'bank', 'cash', 'loan', 'investment']),
    opening_balance: signedMinor.default(0),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .default('INR'),
    archived: z.boolean().default(false),
    principal: minor.nullable().default(null),
    rate_bps: z.number().int().min(0).max(10000).nullable().default(null),
    tenure_months: z.number().int().min(1).max(600).nullable().default(null),
    emi: positiveMinor.nullable().default(null),
    start_date: dateSchema.nullable().default(null),
    lender: z.string().trim().max(120).nullable().default(null),
  })
  .strict();
export const accountSchema = accountInput.extend(base);
export const categoryInput = z
  .object({ name: text, type: z.enum(['income', 'expense']), archived: z.boolean().default(false) })
  .strict();
export const categorySchema = categoryInput.extend(base);
export const transactionInput = z
  .object({
    date: dateSchema,
    type: z.enum(['income', 'expense', 'transfer']),
    amount: positiveMinor,
    account_id: idSchema,
    to_account_id: idSchema.nullable().default(null),
    category_id: idSchema.nullable().default(null),
    note: z.string().trim().max(1000).default(''),
    tags: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
  })
  .strict();
export const transactionSchema = transactionInput.extend(base);
export const paymentInput = z
  .object({
    date: dateSchema,
    amount: positiveMinor,
    kind: z.enum(['emi', 'prepayment']),
    account_id: idSchema,
  })
  .strict();
export const paymentSchema = z
  .object({
    id: idSchema,
    loan_id: idSchema,
    transaction_id: idSchema,
    date: dateSchema,
    amount: positiveMinor,
    kind: z.enum(['emi', 'prepayment']),
    principal: minor,
    interest: minor,
    created_at: timestamp,
  })
  .strict();
export const holdingInput = z
  .object({
    name: text,
    asset_type: z.enum(['stock', 'mutual_fund', 'fd', 'gold', 'crypto', 'other']),
    units: z
      .string()
      .regex(/^\d+(\.\d{1,8})?$/)
      .max(30)
      .nullable()
      .default(null),
  })
  .strict();
export const holdingSchema = holdingInput.extend(base);
export const entryInput = z
  .object({
    date: dateSchema,
    kind: z.enum(['buy', 'sell']),
    amount: positiveMinor,
    units: z
      .string()
      .regex(/^\d+(\.\d{1,8})?$/)
      .max(30)
      .nullable()
      .default(null),
  })
  .strict();
export const entrySchema = entryInput.extend({ ...base, holding_id: idSchema });
export const valuationInput = z.object({ date: dateSchema, value: minor }).strict();
export const valuationSchema = valuationInput.extend({ ...base, holding_id: idSchema });
export const goalInput = z
  .object({
    name: text,
    target_amount: positiveMinor,
    target_date: dateSchema,
    account_id: idSchema.nullable().default(null),
  })
  .strict();
export const goalSchema = goalInput.extend(base);
export const contributionInput = z
  .object({
    date: dateSchema,
    amount: positiveMinor,
    note: z.string().trim().max(1000).default(''),
  })
  .strict();
export const contributionSchema = contributionInput.extend({ ...base, goal_id: idSchema });
export const budgetInput = z
  .object({ category_id: idSchema, month: monthSchema, amount: positiveMinor })
  .strict();
export const budgetSchema = budgetInput.extend(base);
export const passwordSchema = z.string().min(12, 'Use at least 12 characters').max(128);
export const authInput = z.object({ password: passwordSchema }).strict();
export const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const profileInput = z.object({ name: text, email: emailSchema }).strict();
export const registrationInput = profileInput.extend({ password: passwordSchema }).strict();
export const loginInput = z
  .object({ email: emailSchema.optional(), password: passwordSchema })
  .strict();
export type User = {
  id: number;
  name: string;
  email: string | null;
  role: 'admin' | 'user';
  created_at: string;
  last_login_at: string | null;
};
export type AuthStatus = {
  needs_setup: boolean;
  legacy_owner: boolean;
  registration_open: boolean;
  authenticated: boolean;
  user: User | null;
};
export type UserMonitor = {
  data: (User & { active_sessions: number })[];
  total: number;
  page: number;
  limit: number;
  stats: { users: number; admins: number; signed_in_users: number };
};
export const passwordChangeInput = z
  .object({ current_password: passwordSchema, new_password: passwordSchema })
  .strict();
export const listQuery = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(1000).default(50),
});
export const transactionQuery = listQuery.extend({
  from: dateSchema.optional(),
  to: dateSchema.optional(),
  account_id: idSchema.optional(),
  category_id: idSchema.optional(),
  type: z.enum(['income', 'expense', 'transfer']).optional(),
  search: z.string().max(200).optional(),
});
export const datasetSchema = z
  .object({
    accounts: z.array(accountSchema).max(2000),
    categories: z.array(categorySchema).max(2000),
    transactions: z.array(transactionSchema).max(50000),
    loan_payments: z.array(paymentSchema).max(10000),
    holdings: z.array(holdingSchema).max(2000),
    investment_entries: z.array(entrySchema).max(10000),
    valuations: z.array(valuationSchema).max(20000),
    goals: z.array(goalSchema).max(2000),
    contributions: z.array(contributionSchema).max(10000),
    budgets: z.array(budgetSchema).max(10000),
  })
  .strict();
export const backupSchema = z
  .object({ version: z.literal(1), exported_at: timestamp, data: datasetSchema })
  .strict();
export const importSchema = z
  .object({
    mode: z.enum(['replace', 'merge']),
    confirmation: z.enum(['REPLACE', 'MERGE']),
    backup: backupSchema,
  })
  .strict()
  .refine((v) => v.confirmation === v.mode.toUpperCase(), 'Confirmation must match import mode');
export type Account = z.infer<typeof accountSchema> & { balance?: number };
export type Category = z.infer<typeof categorySchema>;
export type Transaction = z.infer<typeof transactionSchema>;
export type Payment = z.infer<typeof paymentSchema>;
export type Holding = z.infer<typeof holdingSchema>;
export type Entry = z.infer<typeof entrySchema>;
export type Valuation = z.infer<typeof valuationSchema>;
export type Goal = z.infer<typeof goalSchema>;
export type Contribution = z.infer<typeof contributionSchema>;
export type Budget = z.infer<typeof budgetSchema>;
export type Dataset = z.infer<typeof datasetSchema>;
export type Backup = z.infer<typeof backupSchema>;
export type Page<T> = { data: T[]; total: number; page: number; limit: number };
