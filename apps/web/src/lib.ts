import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  localDate,
  type Dataset,
  type Account,
  type Payment,
  type Entry,
  type Valuation,
  type Holding,
  type ScheduleRow,
  type Goal,
  type Budget,
  type Category,
  type Transaction,
} from '@folio/shared';

const base = import.meta.env.VITE_API_BASE ?? '/api/v1';
if (!base.startsWith('/') || base.startsWith('//'))
  throw new Error('VITE_API_BASE must be a same-origin path');
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  if (method !== 'GET' && !navigator.onLine)
    throw new Error('You are offline. Connect to save changes.');
  const response = await fetch(`${base}${path}`, {
    method,
    credentials: 'same-origin',
    headers:
      method === 'GET' ? {} : { 'Content-Type': 'application/json', 'X-Finance-Client': 'web' },
    ...(method === 'GET' ? {} : { body: JSON.stringify(body ?? {}) }),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => null);
    if (response.status === 401 && !path.startsWith('/auth/'))
      window.dispatchEvent(new Event('session-expired'));
    throw new ApiError(result?.error?.message ?? 'Could not complete the request', response.status);
  }
  return response.json();
}
export const today = () => localDate();
export function useSnapshot() {
  return useQuery({ queryKey: ['snapshot'], queryFn: () => api<Dataset>('/snapshot') });
}
export function useSave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      path,
      method = 'POST',
      body,
    }: {
      path: string;
      method?: string;
      body?: unknown;
    }) => api(path, method, body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['snapshot'] });
      await qc.invalidateQueries({ queryKey: ['overview'] });
      await qc.invalidateQueries({ queryKey: ['transactions'] });
      await qc.invalidateQueries({ queryKey: ['reports'] });
    },
  });
}
export type LoanView = {
  loan: Account;
  payments: Payment[];
  schedule: ScheduleRow[];
  outstanding: number;
  interest_paid: number;
  remaining_months: number;
  progress: number;
};
export type HoldingView = {
  holding: Holding;
  entries: Entry[];
  valuations: Valuation[];
  invested: number;
  current: number;
  profit: number;
  return_pct: number | null;
  xirr: number | null;
  valued: boolean;
  last_updated: string | null;
  stale: boolean;
};
export type Overview = {
  month: string;
  as_of: string;
  currency: string;
  net_worth: number;
  income: number;
  expense: number;
  savings_rate: number;
  loan_outstanding: number;
  investment_profit: number;
  investment_return: number | null;
  total_invested: number;
  investment_value: number;
  accounts: (Account & { balance: number })[];
  loans: LoanView[];
  holdings: HoldingView[];
  categories: (Category & { total: number })[];
  history: {
    month: string;
    income: number;
    expense: number;
    net_worth: number;
    invested: number;
    value: number;
  }[];
  goals: (Goal & {
    saved: number;
    remaining: number;
    percent: number;
    monthly_required: number;
    overdue: boolean;
  })[];
  budgets: (Budget & { spent: number; remaining: number; percent: number; over: boolean })[];
  recent: Transaction[];
};
export function useOverview(month: string) {
  return useQuery({
    queryKey: ['overview', month, today()],
    queryFn: () => api<Overview>(`/overview?month=${month}&today=${today()}`),
  });
}
export async function download(path: string, filename: string) {
  const response = await fetch(`${base}${path}`, { credentials: 'same-origin' });
  if (!response.ok) throw new Error('Export failed. Please sign in and try again.');
  const url = URL.createObjectURL(await response.blob()),
    a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
export function displayDate(value: string) {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${value.slice(0, 10)}T12:00:00`));
}
export const percent = (v: number | null) => (v === null ? '—' : `${v.toFixed(1)}%`);
