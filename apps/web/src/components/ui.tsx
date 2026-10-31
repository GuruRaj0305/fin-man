import {
  useEffect,
  useRef,
  useState,
  isValidElement,
  cloneElement,
  type ReactElement,
  type ReactNode,
  type FormEvent,
} from 'react';
import { AlertCircle, ArrowRight, Loader2, X, Plus, WalletCards } from 'lucide-react';
import { formatMoney, decimalMoney, toMinor } from '@folio/shared';
import { useSave } from '../lib';

export function Money({ value, currency = 'INR' }: { value: number; currency?: string }) {
  return <>{formatMoney(value, currency)}</>;
}
export function Empty({
  title = 'A fresh start',
  children,
  action,
}: {
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <WalletCards size={26} />
      </div>
      <h3>{title}</h3>
      <p>{children ?? 'Your next chapter starts with the first entry.'}</p>
      {action}
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading" role="status">
      <Loader2 className="spin" size={24} />
      <span>Getting everything in order…</span>
    </div>
  );
}
export function ErrorState({ error, retry }: { error: Error; retry?: () => void }) {
  return (
    <div className="error-state" role="alert">
      <AlertCircle />
      <h3>Something needs attention</h3>
      <p>{error.message}</p>
      {retry && (
        <button className="btn secondary" onClick={retry}>
          Try again
        </button>
      )}
    </div>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}
export function AddButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button className="btn primary" onClick={onClick} disabled={!navigator.onLine}>
      <Plus size={17} />
      {children}
    </button>
  );
}
export function Progress({
  value,
  over = false,
  label,
}: {
  value: number;
  over?: boolean;
  label: string;
}) {
  return (
    <div
      className={`progress ${over ? 'over' : ''}`}
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(Math.min(100, Math.max(0, value)))}
      aria-valuetext={`${Math.round(value)} percent`}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {isValidElement(children) &&
      typeof children.type === 'string' &&
      ['input', 'select', 'textarea'].includes(children.type)
        ? cloneElement(children as ReactElement<{ 'aria-label'?: string }>, { 'aria-label': label })
        : children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function AmountField({
  label = 'Amount',
  name = 'amount',
  value,
  required = true,
  min = '0.01',
}: {
  label?: string;
  name?: string;
  value?: number;
  required?: boolean;
  min?: string;
}) {
  return (
    <Field label={label}>
      <div className="amount-input">
        <span>₹</span>
        <input
          aria-label={label}
          name={name}
          type="number"
          inputMode="decimal"
          step="0.01"
          min={min}
          max="10000000000"
          required={required}
          defaultValue={value !== undefined ? decimalMoney(value) : undefined}
          placeholder="0.00"
        />
      </div>
    </Field>
  );
}
export const amount = (f: FormData, name = 'amount') => toMinor(String(f.get(name) ?? ''));
export const str = (f: FormData, name: string) => String(f.get(name) ?? '').trim();
export function Dialog({
  title,
  children,
  onClose,
  onSubmit,
  submit = 'Save changes',
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  onSubmit: (f: FormData) => Promise<unknown>;
  submit?: string;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    [error, setError] = useState(''),
    [pending, setPending] = useState(false);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');
    try {
      await onSubmit(new FormData(event.currentTarget));
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  return (
    <dialog
      ref={ref}
      className={wide ? 'wide' : ''}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-labelledby="dialog-title"
    >
      <div className="dialog-head">
        <h2 id="dialog-title">{title}</h2>
        <button className="icon-btn" aria-label="Close dialog" onClick={onClose} disabled={pending}>
          <X size={20} />
        </button>
      </div>
      <form onSubmit={save}>
        <div className="dialog-body">
          {children}
          {error && (
            <p className="form-error" role="alert">
              <AlertCircle size={17} />
              {error}
            </p>
          )}
        </div>
        <div className="dialog-actions">
          <button className="btn secondary" type="button" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button className="btn primary" type="submit" disabled={pending || !navigator.onLine}>
            {pending ? <Loader2 className="spin" size={16} /> : null}
            {pending ? 'Saving…' : submit}
          </button>
        </div>
      </form>
    </dialog>
  );
}
export function DeleteButton({
  path,
  label = 'Delete',
  onDone,
}: {
  path: string;
  label?: string;
  onDone?: () => void;
}) {
  const [open, setOpen] = useState(false),
    save = useSave();
  return (
    <>
      <button
        type="button"
        className="text-btn danger"
        disabled={!navigator.onLine}
        onClick={() => setOpen(true)}
      >
        {label}
      </button>
      {open && (
        <Dialog
          title="Delete this record?"
          submit="Delete permanently"
          onClose={() => setOpen(false)}
          onSubmit={async () => {
            await save.mutateAsync({ path, method: 'DELETE' });
            onDone?.();
          }}
        >
          <p>
            This permanently removes the record and its related entries. Export a backup first if
            you may need it later.
          </p>
        </Dialog>
      )}
    </>
  );
}
export function SectionTitle({
  title,
  action,
  description,
}: {
  title: string;
  action?: ReactNode;
  description?: string;
}) {
  return (
    <div className="section-title">
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}
export function LinkArrow() {
  return <ArrowRight size={16} />;
}
