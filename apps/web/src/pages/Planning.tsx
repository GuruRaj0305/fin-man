import { useState } from 'react';
import { Flag, Plus, Sprout, AlertCircle, Pencil } from 'lucide-react';
import type { Goal, Budget } from '@folio/shared';
import { useWorkspace, MonthPicker } from '../App';
import { useSave, today, displayDate, percent } from '../lib';
import { GoalDialog, BudgetDialog } from '../components/forms';
import {
  PageHeading,
  AddButton,
  Money,
  Empty,
  Progress,
  DeleteButton,
  Dialog,
  Field,
  AmountField,
  amount,
  str,
} from '../components/ui';
export function Goals() {
  const { data, current: view } = useWorkspace(),
    save = useSave(),
    [edit, setEdit] = useState<Goal | true | null>(null),
    [contribute, setContribute] = useState<string | null>(null);
  return (
    <>
      <PageHeading
        eyebrow="SOMETHING TO LOOK FORWARD TO"
        title="Good things start with a goal."
        description="A safety net, a big adventure, or simply a little more freedom."
        action={<AddButton onClick={() => setEdit(true)}>Add goal</AddButton>}
      />
      {view.goals.length ? (
        <div className="card-grid">
          {view.goals.map((g) => (
            <section className="panel goal-card" key={g.id}>
              <div className="card-top">
                <span className="large-icon">
                  <Flag size={22} />
                </span>
                <span className={`pill ${g.overdue ? 'warning' : ''}`}>
                  {g.overdue
                    ? 'Past target date'
                    : g.percent >= 100
                      ? 'Goal reached'
                      : 'Growing steadily'}
                </span>
              </div>
              <h2>{g.name}</h2>
              <p className="muted small">
                By {displayDate(g.target_date)} ·{' '}
                {g.account_id
                  ? data.accounts.find((a) => a.id === g.account_id)?.name
                  : 'Manual contributions'}
              </p>
              <div className="goal-amount">
                <strong>
                  <Money value={g.saved} />
                </strong>
                <span>
                  of <Money value={g.target_amount} />
                </span>
              </div>
              <Progress value={g.percent} label={g.name} />
              <div className="progress-label">
                <span>{percent(g.percent)} of the way there</span>
                <span>
                  <Money value={g.monthly_required} /> / month
                </span>
              </div>
              <div className="card-footer">
                {!g.account_id && (
                  <button
                    className="text-link"
                    onClick={() => setContribute(g.id)}
                    disabled={!navigator.onLine}
                  >
                    <Plus size={15} />
                    Contribute
                  </button>
                )}
                <button className="text-btn" onClick={() => setEdit(g)}>
                  <Pencil size={14} />
                  Edit
                </button>
                <DeleteButton path={`/goals/${g.id}`} />
              </div>
              {!g.account_id && data.contributions.some((c) => c.goal_id === g.id) && (
                <details className="contributions">
                  <summary>Contribution history</summary>
                  {data.contributions
                    .filter((c) => c.goal_id === g.id)
                    .map((c) => (
                      <div key={c.id}>
                        <span>
                          {displayDate(c.date)} · <Money value={c.amount} />
                        </span>
                        <DeleteButton path={`/goals/${g.id}/contributions/${c.id}`} />
                      </div>
                    ))}
                </details>
              )}
            </section>
          ))}
        </div>
      ) : (
        <section className="panel">
          <Empty
            title="What are you looking forward to?"
            action={<AddButton onClick={() => setEdit(true)}>Create your first goal</AddButton>}
          >
            A named goal makes saving feel a little more meaningful.
          </Empty>
        </section>
      )}
      <div className="info-card">
        <Sprout size={22} />
        <p>
          The monthly saving estimate spreads your remaining target across the time left, rounded up
          to the next paise. Linked goals follow your savings account balance. Manual contributions
          track progress without moving account cash.
        </p>
      </div>
      {edit && (
        <GoalDialog
          data={data}
          existing={edit === true ? undefined : edit}
          onClose={() => setEdit(null)}
        />
      )}
      {contribute && (
        <Dialog
          title="A little closer to your goal"
          submit="Add contribution"
          onClose={() => setContribute(null)}
          onSubmit={async (f) => {
            await save.mutateAsync({
              path: `/goals/${contribute}/contributions`,
              body: { date: str(f, 'date'), amount: amount(f), note: str(f, 'note') },
            });
          }}
        >
          <AmountField />
          <Field label="Date">
            <input name="date" type="date" required defaultValue={today()} />
          </Field>
          <Field label="Note">
            <input name="note" maxLength={1000} placeholder="A little something for the future" />
          </Field>
        </Dialog>
      )}
    </>
  );
}
export function Budgets() {
  const { data, view, month } = useWorkspace(),
    [edit, setEdit] = useState<Budget | true | null>(null);
  const total = view.budgets.reduce((s, b) => s + b.amount, 0),
    spent = view.budgets.reduce((s, b) => s + b.spent, 0);
  return (
    <>
      <PageHeading
        eyebrow="A LITTLE INTENTION"
        title="Make space for what matters."
        description="Gentle guardrails for your everyday spending."
        action={
          <div className="heading-actions">
            <MonthPicker />
            <AddButton onClick={() => setEdit(true)}>Add budget</AddButton>
          </div>
        }
      />
      <div className="metric-grid three">
        <div className="panel metric">
          <small>Planned spending</small>
          <strong>
            <Money value={total} />
          </strong>
        </div>
        <div className="panel metric">
          <small>Spent in budgeted categories</small>
          <strong>
            <Money value={spent} />
          </strong>
        </div>
        <div className="panel metric">
          <small>Room remaining</small>
          <strong className={total - spent < 0 ? 'negative' : 'positive'}>
            <Money value={total - spent} />
          </strong>
        </div>
      </div>
      {view.budgets.length ? (
        <div className="card-grid">
          {view.budgets.map((b) => (
            <section className={`panel budget-card ${b.over ? 'over-budget' : ''}`} key={b.id}>
              <div className="card-title">
                <h2>{data.categories.find((c) => c.id === b.category_id)?.name}</h2>
                {b.over ? (
                  <AlertCircle className="negative" size={21} />
                ) : (
                  <span className="pill">On track</span>
                )}
              </div>
              <div className="goal-amount">
                <strong>
                  <Money value={b.spent} />
                </strong>
                <span>
                  of <Money value={b.amount} />
                </span>
              </div>
              <Progress
                value={b.percent}
                over={b.over}
                label={`${data.categories.find((c) => c.id === b.category_id)?.name} budget`}
              />
              <div className="progress-label">
                <span className={b.over ? 'negative' : ''}>
                  {b.over ? 'Over budget by' : 'Still available'}{' '}
                  <Money value={Math.abs(b.remaining)} />
                </span>
                <span>{percent(b.percent)}</span>
              </div>
              <div className="card-footer">
                <button className="text-btn" onClick={() => setEdit(b)}>
                  <Pencil size={14} />
                  Adjust
                </button>
                <DeleteButton path={`/budgets/${b.id}`} />
              </div>
            </section>
          ))}
        </div>
      ) : (
        <section className="panel">
          <Empty
            title="A plan with room to breathe"
            action={<AddButton onClick={() => setEdit(true)}>Set a monthly budget</AddButton>}
          >
            Choose a category and a comfortable spending limit for this month.
          </Empty>
        </section>
      )}
      {edit && (
        <BudgetDialog
          data={data}
          month={month}
          existing={edit === true ? undefined : edit}
          onClose={() => setEdit(null)}
        />
      )}
    </>
  );
}
