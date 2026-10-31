import { useState } from 'react';
import {
  calculateEmi,
  toMinor,
  type Account,
  type Transaction,
  type Dataset,
  type Holding,
  type Goal,
  type Budget,
  type Category,
} from '@folio/shared';
import { useSave, today } from '../lib';
import { Dialog, Field, AmountField, amount, str } from './ui';

function cleanAccount(a: Account) {
  const { id, created_at, balance, ...input } = a;
  void id;
  void created_at;
  void balance;
  return input;
}
export function AccountDialog({
  onClose,
  existing,
  loan = false,
}: {
  onClose: () => void;
  existing?: Account;
  loan?: boolean;
}) {
  const save = useSave(),
    [type, setType] = useState(existing?.type ?? (loan ? 'loan' : 'bank'));
  return (
    <Dialog
      title={existing ? 'Edit account' : loan ? 'A new loan' : 'A new account'}
      onClose={onClose}
      onSubmit={async (f) => {
        const principal = type === 'loan' ? amount(f, 'principal') : null,
          rate = type === 'loan' ? toMinor(str(f, 'rate')) : null,
          tenure = type === 'loan' ? Number(str(f, 'tenure')) : null;
        const input = {
          name: str(f, 'name'),
          type,
          currency: str(f, 'currency').toUpperCase(),
          opening_balance: type === 'loan' ? 0 : amount(f, 'opening_balance'),
          archived: existing?.archived ?? false,
          principal,
          rate_bps: rate,
          tenure_months: tenure,
          emi:
            type === 'loan'
              ? str(f, 'emi')
                ? amount(f, 'emi')
                : calculateEmi(principal!, rate!, tenure!)
              : null,
          start_date: type === 'loan' ? str(f, 'start_date') : null,
          lender: type === 'loan' ? str(f, 'lender') : null,
        };
        await save.mutateAsync({
          path: existing ? `/accounts/${existing.id}` : '/accounts',
          method: existing ? 'PUT' : 'POST',
          body: input,
        });
      }}
    >
      <Field label="Account name">
        <input
          autoFocus
          name="name"
          required
          maxLength={120}
          defaultValue={existing?.name}
          placeholder={loan ? 'e.g. Car loan' : 'e.g. Everyday account'}
        />
      </Field>
      <div className="form-grid">
        <Field label="Account type">
          <select
            name="type"
            value={type}
            onChange={(e) => setType(e.target.value as Account['type'])}
          >
            <option value="bank">Bank · current</option>
            <option value="savings">Savings</option>
            <option value="cash">Cash</option>
            <option value="investment">Investment cash</option>
            <option value="loan">Loan</option>
          </select>
        </Field>
        <Field label="Currency">
          <input
            name="currency"
            required
            pattern="[A-Za-z]{3}"
            maxLength={3}
            defaultValue={existing?.currency ?? 'INR'}
          />
        </Field>
      </div>
      {type !== 'loan' ? (
        <AmountField
          label="Opening balance"
          name="opening_balance"
          value={existing?.opening_balance ?? 0}
          min="-10000000000"
        />
      ) : (
        <>
          <div className="form-grid">
            <AmountField
              label="Principal"
              name="principal"
              value={existing?.principal ?? undefined}
            />
            <Field label="Annual interest rate (%)">
              <input
                type="number"
                name="rate"
                min="0"
                max="100"
                step="0.01"
                required
                defaultValue={
                  existing?.rate_bps !== null && existing?.rate_bps !== undefined
                    ? existing.rate_bps / 100
                    : 8.5
                }
              />
            </Field>
            <Field label="Tenure (months)">
              <input
                name="tenure"
                type="number"
                min="1"
                max="600"
                required
                defaultValue={existing?.tenure_months ?? 60}
              />
            </Field>
            <AmountField
              label="EMI (optional)"
              name="emi"
              required={false}
              value={existing?.emi ?? undefined}
            />
            <Field label="Start date">
              <input
                type="date"
                name="start_date"
                required
                defaultValue={existing?.start_date ?? today()}
              />
            </Field>
            <Field label="Lender">
              <input
                name="lender"
                maxLength={120}
                defaultValue={existing?.lender ?? ''}
                placeholder="Bank or lender"
              />
            </Field>
          </div>
          <p className="hint">
            Leave EMI blank to calculate it from your loan terms. Payments split into principal and
            interest automatically.
          </p>
        </>
      )}
    </Dialog>
  );
}
export async function archiveAccount(save: ReturnType<typeof useSave>, a: Account) {
  return save.mutateAsync({
    path: `/accounts/${a.id}`,
    method: 'PUT',
    body: { ...cleanAccount(a), archived: !a.archived },
  });
}
export function TransactionDialog({
  data,
  onClose,
  existing,
}: {
  data: Dataset;
  onClose: () => void;
  existing?: Transaction;
}) {
  const save = useSave(),
    [type, setType] = useState<Transaction['type']>(existing?.type ?? 'expense');
  const accounts = data.accounts.filter((a) => !a.archived && a.type !== 'loan'),
    categories = data.categories.filter((c) => !c.archived && c.type === type);
  return (
    <Dialog
      title={existing ? 'Edit transaction' : 'A little entry, a clearer picture'}
      onClose={onClose}
      submit={existing ? 'Save changes' : 'Add transaction'}
      onSubmit={async (f) => {
        await save.mutateAsync({
          path: existing ? `/transactions/${existing.id}` : '/transactions',
          method: existing ? 'PUT' : 'POST',
          body: {
            type,
            amount: amount(f),
            date: str(f, 'date'),
            account_id: str(f, 'account_id'),
            to_account_id: type === 'transfer' ? str(f, 'to_account_id') : null,
            category_id: type === 'transfer' ? null : str(f, 'category_id'),
            note: str(f, 'note'),
            tags: str(f, 'tags')
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean),
          },
        });
      }}
    >
      <div className="segmented">
        {(['expense', 'income', 'transfer'] as const).map((t) => (
          <button
            key={t}
            type="button"
            className={type === t ? 'active' : ''}
            onClick={() => setType(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <AmountField value={existing?.amount} />
      <div className="form-grid">
        <Field label="Account">
          <select name="account_id" required defaultValue={existing?.account_id ?? accounts[0]?.id}>
            <option value="" disabled>
              Select account
            </option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {a.currency}
              </option>
            ))}
          </select>
        </Field>
        {type === 'transfer' ? (
          <Field label="To account">
            <select name="to_account_id" required defaultValue={existing?.to_account_id ?? ''}>
              <option value="" disabled>
                Select destination
              </option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <Field label="Category">
            <select
              key={type}
              name="category_id"
              required
              defaultValue={
                existing?.type === type ? (existing.category_id ?? '') : categories[0]?.id
              }
            >
              <option value="" disabled>
                Select category
              </option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Date">
          <input name="date" type="date" required defaultValue={existing?.date ?? today()} />
        </Field>
        <Field label="Tags (comma separated)">
          <input
            name="tags"
            maxLength={500}
            defaultValue={existing?.tags.join(', ')}
            placeholder="home, essentials"
          />
        </Field>
      </div>
      <Field label="Note">
        <input
          name="note"
          maxLength={1000}
          defaultValue={existing?.note}
          placeholder="What was it for?"
        />
      </Field>
      {!accounts.length && (
        <p className="form-error">Add an account first to record a transaction.</p>
      )}
    </Dialog>
  );
}
export function HoldingDialog({ existing, onClose }: { existing?: Holding; onClose: () => void }) {
  const save = useSave();
  return (
    <Dialog
      title={existing ? 'Edit holding' : 'Plant a new investment'}
      onClose={onClose}
      onSubmit={async (f) => {
        await save.mutateAsync({
          path: existing ? `/investments/${existing.id}` : '/investments',
          method: existing ? 'PUT' : 'POST',
          body: {
            name: str(f, 'name'),
            asset_type: str(f, 'asset_type'),
            units: str(f, 'units') || null,
          },
        });
      }}
    >
      <Field label="Holding name">
        <input
          autoFocus
          name="name"
          required
          maxLength={120}
          defaultValue={existing?.name}
          placeholder="e.g. Nifty 50 index fund"
        />
      </Field>
      <Field label="Asset type">
        <select name="asset_type" defaultValue={existing?.asset_type ?? 'mutual_fund'}>
          {['stock', 'mutual_fund', 'fd', 'gold', 'crypto', 'other'].map((t) => (
            <option key={t} value={t}>
              {t.replaceAll('_', ' ')}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Units / quantity (optional)">
        <input
          name="units"
          inputMode="decimal"
          pattern="\d+(\.\d{1,8})?"
          defaultValue={existing?.units ?? ''}
        />
      </Field>
      <p className="hint">
        After adding a holding, record a buy entry and update its current value. Holdings use INR
        and are tracked separately from account cash.
      </p>
    </Dialog>
  );
}
export function GoalDialog({
  data,
  existing,
  onClose,
}: {
  data: Dataset;
  existing?: Goal;
  onClose: () => void;
}) {
  const save = useSave();
  return (
    <Dialog
      title={existing ? 'Edit your goal' : 'Give your savings a purpose'}
      onClose={onClose}
      onSubmit={async (f) => {
        await save.mutateAsync({
          path: existing ? `/goals/${existing.id}` : '/goals',
          method: existing ? 'PUT' : 'POST',
          body: {
            name: str(f, 'name'),
            target_amount: amount(f),
            target_date: str(f, 'target_date'),
            account_id: str(f, 'account_id') || null,
          },
        });
      }}
    >
      <Field label="Goal name">
        <input
          autoFocus
          name="name"
          required
          maxLength={120}
          defaultValue={existing?.name}
          placeholder="e.g. The freedom fund"
        />
      </Field>
      <AmountField label="Target amount" value={existing?.target_amount} />
      <Field label="Target date">
        <input type="date" name="target_date" required defaultValue={existing?.target_date} />
      </Field>
      <Field label="How will you track it?">
        <select name="account_id" defaultValue={existing?.account_id ?? ''}>
          <option value="">Manual contributions</option>
          {data.accounts
            .filter((a) => a.type === 'savings' && a.currency === 'INR' && !a.archived)
            .map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · account balance
              </option>
            ))}
        </select>
      </Field>
      <p className="hint">
        Linked goals follow the entire savings account balance. Manual goals track contributions
        separately and do not add to net worth.
      </p>
    </Dialog>
  );
}
export function BudgetDialog({
  data,
  month,
  existing,
  onClose,
}: {
  data: Dataset;
  month: string;
  existing?: Budget;
  onClose: () => void;
}) {
  const save = useSave();
  return (
    <Dialog
      title={existing ? 'Adjust your budget' : 'Make room for what matters'}
      onClose={onClose}
      onSubmit={async (f) => {
        await save.mutateAsync({
          path: existing ? `/budgets/${existing.id}` : '/budgets',
          method: existing ? 'PUT' : 'POST',
          body: { category_id: str(f, 'category_id'), month: str(f, 'month'), amount: amount(f) },
        });
      }}
    >
      <Field label="Expense category">
        <select name="category_id" required defaultValue={existing?.category_id}>
          {data.categories
            .filter((c) => c.type === 'expense' && !c.archived)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </select>
      </Field>
      <Field label="Month">
        <input name="month" type="month" required defaultValue={existing?.month ?? month} />
      </Field>
      <AmountField label="Monthly limit" value={existing?.amount} />
    </Dialog>
  );
}
export function CategoryDialog({
  existing,
  onClose,
}: {
  existing?: Category;
  onClose: () => void;
}) {
  const save = useSave();
  return (
    <Dialog
      title={existing ? 'Edit category' : 'Add a category'}
      onClose={onClose}
      onSubmit={async (f) => {
        await save.mutateAsync({
          path: existing ? `/categories/${existing.id}` : '/categories',
          method: existing ? 'PUT' : 'POST',
          body: {
            name: str(f, 'name'),
            type: str(f, 'type'),
            archived: existing?.archived ?? false,
          },
        });
      }}
    >
      <Field label="Name">
        <input name="name" required maxLength={120} autoFocus defaultValue={existing?.name} />
      </Field>
      <Field label="Type">
        <select name="type" defaultValue={existing?.type ?? 'expense'}>
          <option value="expense">Expense</option>
          <option value="income">Income</option>
        </select>
      </Field>
    </Dialog>
  );
}
