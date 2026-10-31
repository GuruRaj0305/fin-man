import { useState } from 'react';
import { Download, Upload, Plus, ShieldCheck, Moon, Database, Pencil } from 'lucide-react';
import {
  backupSchema,
  parseCsv,
  toMinor,
  transactionInput,
  type Category,
  type Backup,
  type Transaction,
} from '@folio/shared';
import { useWorkspace } from '../App';
import { api, download, useSave, today } from '../lib';
import { CategoryDialog } from '../components/forms';
import { PageHeading, SectionTitle, Field, Dialog, str } from '../components/ui';
export function SettingsPage() {
  const { data, theme, setTheme } = useWorkspace(),
    save = useSave(),
    [category, setCategory] = useState<Category | true | null>(null),
    [password, setPassword] = useState(false),
    [backup, setBackup] = useState<Backup | null>(null),
    [mode, setMode] = useState('merge'),
    [confirmation, setConfirmation] = useState(''),
    [csv, setCsv] = useState<string[][] | null>(null),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  async function readFile(file: File | undefined, kind: 'json' | 'csv') {
    if (!file) return;
    setError('');
    setNotice('');
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error('File is larger than 20 MB');
      const text = await file.text();
      if (kind === 'json') {
        setBackup(backupSchema.parse(JSON.parse(text)));
        setConfirmation('');
      } else {
        const rows = parseCsv(text);
        if (rows.length < 2 || rows.length > 501)
          throw new Error('CSV must have a header and between 1 and 500 transaction rows');
        setCsv(rows);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="MAKE IT YOURS"
        title="A workspace that feels like you."
        description="Your preferences, your categories, your data."
      />
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="success-message" role="status">
          {notice}
        </p>
      )}
      <div className="settings-grid">
        <section className="panel">
          <SectionTitle title="A little atmosphere" action={<Moon size={20} />} />
          <p className="muted">Choose how Folio looks on this device.</p>
          <Field label="Appearance">
            <select value={theme} onChange={(e) => setTheme(e.target.value)}>
              <option value="system">Follow system</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </Field>
        </section>
        <section className="panel">
          <SectionTitle title="Your private space" action={<ShieldCheck size={20} />} />
          <p className="muted">
            A single password protects your workspace. Changing it signs out every other session.
          </p>
          <div className="settings-buttons">
            <button className="btn secondary" onClick={() => setPassword(true)}>
              Change password
            </button>
            <button
              className="text-btn danger"
              onClick={async () => {
                try {
                  await api('/auth/logout-all', 'POST', {});
                  window.location.reload();
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Log out everywhere
            </button>
          </div>
        </section>
      </div>
      <section className="panel">
        <SectionTitle
          title="Your data belongs to you"
          description="Keep a backup somewhere safe, and take your finances with you."
          action={<Database size={21} />}
        />
        <div className="portability-grid">
          <div>
            <h3>A complete snapshot</h3>
            <p>
              All accounts, transactions, loans, investments, goals, categories, and budgets in one
              JSON file. Passwords and sessions are excluded.
            </p>
            <button
              className="btn secondary"
              onClick={async () => {
                try {
                  await download('/export', `folio-backup-${today()}.json`);
                  setNotice(
                    'Backup exported. Keep it in a safe place: it contains your financial information.',
                  );
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              <Download size={16} />
              Export JSON backup
            </button>
          </div>
          <div>
            <h3>Bring your data home</h3>
            <p>
              Restore a Folio backup, or import transactions from a CSV with a preview and column
              mapping.
            </p>
            <div className="settings-buttons">
              <label className="btn secondary file-button">
                <Upload size={16} />
                Import JSON
                <input
                  aria-label="Import JSON backup"
                  type="file"
                  accept=".json,application/json"
                  onChange={(e) => {
                    void readFile(e.target.files?.[0], 'json');
                    e.target.value = '';
                  }}
                />
              </label>
              <label className="btn secondary file-button">
                <Upload size={16} />
                Import CSV
                <input
                  aria-label="Import CSV transactions"
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => {
                    void readFile(e.target.files?.[0], 'csv');
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
          </div>
        </div>
        <div className="backup-note">
          Backups are unencrypted and contain financial data. Store them privately. JSON imports
          support files up to 20 MB; CSV imports support 500 rows at a time. Merge matches record
          IDs and overwrites matching records.
        </div>
      </section>
      <section className="panel">
        <SectionTitle
          title="Everything in its place"
          description="Categories for the way you earn and spend."
          action={
            <button className="btn secondary" onClick={() => setCategory(true)}>
              <Plus size={16} />
              Add category
            </button>
          }
        />
        <div className="category-settings">
          {(['expense', 'income'] as const).map((type) => (
            <div key={type}>
              <h3>{type === 'expense' ? 'Money out' : 'Money in'}</h3>
              {data.categories
                .filter((c) => c.type === type)
                .map((c) => (
                  <div className={`category-setting ${c.archived ? 'archived' : ''}`} key={c.id}>
                    <span>
                      {c.name}
                      {c.archived && <small> · archived</small>}
                    </span>
                    <div>
                      <button
                        className="icon-btn"
                        aria-label={`Edit ${c.name} ${c.type}`}
                        onClick={() => setCategory(c)}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        className="text-btn"
                        onClick={async () => {
                          try {
                            await save.mutateAsync({
                              path: `/categories/${c.id}`,
                              method: 'PUT',
                              body: { name: c.name, type: c.type, archived: !c.archived },
                            });
                          } catch (e) {
                            setError((e as Error).message);
                          }
                        }}
                      >
                        {c.archived ? 'Restore' : 'Archive'}
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          ))}
        </div>
      </section>
      {category && (
        <CategoryDialog
          existing={category === true ? undefined : category}
          onClose={() => setCategory(null)}
        />
      )}
      {password && (
        <Dialog
          title="Change your password"
          submit="Update password"
          onClose={() => setPassword(false)}
          onSubmit={async (f) => {
            await api('/auth/password', 'POST', {
              current_password: str(f, 'current'),
              new_password: str(f, 'new'),
            });
            setNotice('Password updated. Other sessions have been signed out.');
          }}
        >
          <Field label="Current password">
            <input
              type="password"
              name="current"
              autoComplete="current-password"
              minLength={12}
              maxLength={128}
              required
            />
          </Field>
          <Field label="New password">
            <input
              type="password"
              name="new"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              required
            />
          </Field>
        </Dialog>
      )}
      {backup && (
        <Dialog
          title="Review your import"
          submit={mode === 'replace' ? 'Replace my finance data' : 'Merge finance data'}
          onClose={() => setBackup(null)}
          onSubmit={async () => {
            if (confirmation !== mode.toUpperCase())
              throw new Error(`Type ${mode.toUpperCase()} to confirm`);
            await save.mutateAsync({ path: '/import', body: { mode, confirmation, backup } });
            setNotice('Your backup was imported successfully.');
          }}
        >
          <p>
            Backup from {new Date(backup.exported_at).toLocaleString()} ·{' '}
            {Object.values(backup.data).reduce((s, rows) => s + rows.length, 0)} records.
          </p>
          <Field label="Import method">
            <select
              value={mode}
              onChange={(e) => {
                setMode(e.target.value);
                setConfirmation('');
              }}
            >
              <option value="merge">Merge · overwrite matching IDs, keep other records</option>
              <option value="replace">Replace · delete all existing finance data first</option>
            </select>
          </Field>
          <p className={mode === 'replace' ? 'form-error' : 'hint'}>
            {mode === 'replace'
              ? 'This permanently replaces all existing financial records. Export a backup before continuing.'
              : 'Records with the same ID will be overwritten. References and loan allocations must remain consistent.'}
          </p>
          <Field label={`Type ${mode.toUpperCase()} to confirm`}>
            <input
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              required
              autoComplete="off"
            />
          </Field>
        </Dialog>
      )}
      {csv && (
        <CsvImport
          rows={csv}
          onClose={() => setCsv(null)}
          onDone={(n) => setNotice(`Imported ${n} transactions.`)}
        />
      )}
    </>
  );
}
function CsvImport({
  rows,
  onClose,
  onDone,
}: {
  rows: string[][];
  onClose: () => void;
  onDone: (n: number) => void;
}) {
  const { data } = useWorkspace(),
    save = useSave(),
    headers = rows[0],
    keys = ['date', 'type', 'amount', 'account', 'to_account', 'category', 'note', 'tags'] as const;
  const [mapping, setMapping] = useState<Record<string, string>>(
      Object.fromEntries(
        keys.map((k) => [k, String(headers.findIndex((h) => h.trim().toLowerCase() === k))]),
      ),
    ),
    [preview, setPreview] = useState<Transaction[] | null>(null),
    [problem, setProblem] = useState('');
  function build() {
    try {
      const result = rows.slice(1).map((row, i) => {
        const get = (k: string) => row[Number(mapping[k])] ?? '',
          type = get('type').toLowerCase(),
          findAccount = (v: string) =>
            data.accounts.find((a) => a.id === v || a.name.toLowerCase() === v.toLowerCase())?.id;
        try {
          return transactionInput.parse({
            date: get('date'),
            type,
            amount: toMinor(get('amount')),
            account_id: findAccount(get('account')) ?? get('account'),
            to_account_id:
              type === 'transfer' ? (findAccount(get('to_account')) ?? get('to_account')) : null,
            category_id:
              type === 'transfer'
                ? null
                : (data.categories.find(
                    (c) =>
                      c.type === type &&
                      (c.id === get('category') ||
                        c.name.toLowerCase() === get('category').toLowerCase()),
                  )?.id ?? get('category')),
            note: get('note'),
            tags: get('tags').split('|').filter(Boolean),
          });
        } catch {
          throw new Error(
            `Row ${i + 2}: check date, type, decimal amount, account, and category. Use account/category names or IDs.`,
          );
        }
      });
      setPreview(result as Transaction[]);
      setProblem('');
    } catch (e) {
      setProblem((e as Error).message);
      setPreview(null);
    }
  }
  return (
    <Dialog
      title="Map your transaction columns"
      submit="Import transactions"
      wide
      onClose={onClose}
      onSubmit={async (f) => {
        if (!preview) throw new Error('Preview and validate the rows first');
        if (str(f, 'confirm') !== 'IMPORT') throw new Error('Type IMPORT to confirm');
        await save.mutateAsync({
          path: '/import/csv',
          body: { transactions: preview, confirmation: 'IMPORT' },
        });
        onDone(preview.length);
      }}
    >
      <p className="hint">
        {rows.length - 1} rows. Amounts are decimal currency (e.g. 125.50), dates are YYYY-MM-DD,
        and type is income, expense, or transfer. Accounts and categories must already exist. CSV
        import adds rows; it does not deduplicate.
      </p>
      <div className="form-grid">
        {keys.map((k) => (
          <Field
            key={k}
            label={`${k.replaceAll('_', ' ')}${['to_account', 'note', 'tags'].includes(k) ? ' (optional)' : ''}`}
          >
            <select
              value={mapping[k]}
              onChange={(e) => {
                setMapping({ ...mapping, [k]: e.target.value });
                setPreview(null);
              }}
            >
              <option value="-1">Not mapped</option>
              {headers.map((h, i) => (
                <option key={i} value={String(i)}>
                  {h}
                </option>
              ))}
            </select>
          </Field>
        ))}
      </div>
      <button className="btn secondary" type="button" onClick={build}>
        Preview & validate
      </button>
      {problem && (
        <p className="form-error" role="alert">
          {problem}
        </p>
      )}
      {preview && (
        <>
          <p className="success-message">
            {preview.length} rows passed input validation. References are checked again before any
            rows are saved.
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {headers.map((h, i) => (
                    <th key={i}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(1, 6).map((row, i) => (
                  <tr key={i}>
                    {row.map((v, j) => (
                      <td key={j}>{v}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Field label="Type IMPORT to confirm">
            <input name="confirm" required pattern="IMPORT" autoComplete="off" />
          </Field>
        </>
      )}
    </Dialog>
  );
}
