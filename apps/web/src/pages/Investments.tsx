import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, Sprout, TrendingUp, Plus } from 'lucide-react';
import { useWorkspace } from '../App';
import { useSave, today, percent, displayDate } from '../lib';
import { HoldingDialog } from '../components/forms';
import {
  PageHeading,
  AddButton,
  Money,
  Empty,
  SectionTitle,
  Dialog,
  Field,
  AmountField,
  amount,
  str,
  DeleteButton,
} from '../components/ui';
import { InvestmentChart } from '../components/charts';
export function Investments() {
  const { current: view } = useWorkspace(),
    [add, setAdd] = useState(false);
  return (
    <>
      <PageHeading
        eyebrow="GIVE IT TIME TO GROW"
        title="A future worth investing in."
        description="Your portfolio, at your pace. Update values whenever you like."
        action={<AddButton onClick={() => setAdd(true)}>Add investment</AddButton>}
      />
      <div className="metric-grid three">
        <div className="panel metric">
          <small>Net invested</small>
          <strong>
            <Money value={view.total_invested} />
          </strong>
        </div>
        <div className="panel metric">
          <small>Current value</small>
          <strong>
            <Money value={view.investment_value} />
          </strong>
        </div>
        <div className="panel metric">
          <small>Total profit / loss</small>
          <strong className={view.investment_profit >= 0 ? 'positive' : 'negative'}>
            <Money value={view.investment_profit} />
          </strong>
          <small>{percent(view.investment_return)} return</small>
        </div>
      </div>
      {view.holdings.length ? (
        <div className="card-grid">
          {view.holdings.map((h) => (
            <section className="panel investment-card" key={h.holding.id}>
              <div className="card-top">
                <span className="large-icon">
                  <Sprout size={23} />
                </span>
                <span className="pill">{h.holding.asset_type.replaceAll('_', ' ')}</span>
              </div>
              <Link className="card-title" to={`/investments/${h.holding.id}`}>
                <h2>{h.holding.name}</h2>
                <ArrowUpRight size={18} />
              </Link>
              <div className="account-balance">
                <Money value={h.current} />
              </div>
              <div className={h.profit >= 0 ? 'positive' : 'negative'}>
                <Money value={h.profit} /> <span className="small">({percent(h.return_pct)})</span>
              </div>
              <div className="card-footer">
                <span className="small muted">
                  {h.last_updated
                    ? `Updated ${displayDate(h.last_updated)}`
                    : 'Add a current valuation'}
                </span>
                <Link className="text-link" to={`/investments/${h.holding.id}`}>
                  Details
                  <ArrowUpRight size={15} />
                </Link>
              </div>
            </section>
          ))}
        </div>
      ) : (
        <section className="panel">
          <Empty
            title="Plant something for tomorrow"
            action={<AddButton onClick={() => setAdd(true)}>Add your first investment</AddButton>}
          >
            Track funds, shares, gold, deposits, and more. No market noise required.
          </Empty>
        </section>
      )}
      {add && <HoldingDialog onClose={() => setAdd(false)} />}
    </>
  );
}
export function InvestmentDetail() {
  const { id } = useParams(),
    { current: view } = useWorkspace(),
    save = useSave(),
    [dialog, setDialog] = useState<'entry' | 'valuation' | 'edit' | null>(null);
  const h = view.holdings.find((h) => h.holding.id === id);
  if (!h)
    return (
      <Empty title="Holding not found">
        <Link to="/investments">All investments</Link>
      </Empty>
    );
  const history = h.valuations.map((v) => ({
    date: v.date,
    value: v.value,
    invested: h.entries
      .filter((e) => e.date <= v.date)
      .reduce((s, e) => s + (e.kind === 'buy' ? e.amount : -e.amount), 0),
  }));
  return (
    <>
      <Link className="back-link" to="/investments">
        <ArrowLeft size={15} />
        All investments
      </Link>
      <PageHeading
        eyebrow={h.holding.asset_type.replaceAll('_', ' ').toUpperCase()}
        title={h.holding.name}
        description={
          h.last_updated
            ? `Last valuation ${displayDate(h.last_updated)}${h.stale ? ' · A newer cash flow needs a fresh valuation.' : ''}`
            : 'Add a buy entry, then a current valuation.'
        }
        action={
          <div className="heading-actions">
            <button className="btn secondary" onClick={() => setDialog('entry')}>
              <Plus size={16} />
              Add entry
            </button>
            <AddButton onClick={() => setDialog('valuation')}>Update value</AddButton>
          </div>
        }
      />
      <div className="metric-grid">
        <div className="panel metric">
          <small>Net invested</small>
          <strong>
            <Money value={h.invested} />
          </strong>
        </div>
        <div className="panel metric">
          <small>Current value</small>
          <strong>
            <Money value={h.current} />
          </strong>
        </div>
        <div className="panel metric">
          <small>Profit / loss</small>
          <strong className={h.profit >= 0 ? 'positive' : 'negative'}>
            <Money value={h.profit} />
          </strong>
          <small data-testid="investment-return">{percent(h.return_pct)} return</small>
        </div>
        <div className="panel metric">
          <small>Annualized XIRR</small>
          <strong>{percent(h.xirr === null ? null : h.xirr * 100)}</strong>
          <small>To the latest valuation date</small>
        </div>
      </div>
      <section className="panel">
        <SectionTitle
          title="Watch it grow"
          description="Your manually recorded valuations and dated net contributions"
          action={<TrendingUp size={20} />}
        />
        {history.length ? (
          <InvestmentChart data={history} />
        ) : (
          <Empty title="A little history in the making">
            Update the current value to start your chart.
          </Empty>
        )}
      </section>
      <div className="two-col">
        <section className="panel">
          <SectionTitle
            title="Buys & withdrawals"
            description="Net invested = buys minus sell proceeds"
          />
          {h.entries.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Amount</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {h.entries.map((e) => (
                    <tr key={e.id}>
                      <td>{displayDate(e.date)}</td>
                      <td>
                        <span className="badge">
                          {e.kind === 'buy' ? 'Buy / top-up' : 'Sell / withdraw'}
                        </span>
                      </td>
                      <td>
                        <Money value={e.amount} />
                      </td>
                      <td>
                        <DeleteButton path={`/investments/${id}/entries/${e.id}`} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title="Record your first buy">
              Keep track of the money you put in and take out.
            </Empty>
          )}
        </section>
        <section className="panel">
          <SectionTitle title="Value history" />
          {h.valuations.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Current value</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {[...h.valuations].reverse().map((v) => (
                    <tr key={v.id}>
                      <td>{displayDate(v.date)}</td>
                      <td>
                        <Money value={v.value} />
                      </td>
                      <td>
                        <DeleteButton path={`/investments/${id}/valuations/${v.id}`} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title="Give it a value">You control when your portfolio is updated.</Empty>
          )}
        </section>
      </div>
      <div className="info-card">
        <Sprout size={22} />
        <p>
          Holdings are tracked in INR, separately from account cash. Record account withdrawals
          yourself to avoid double counting assets. Return is profit ÷ net invested; it is undefined
          when net invested is zero or negative. XIRR can have multiple solutions for mixed cash
          flows.
        </p>
      </div>
      <div className="row-actions">
        <button className="btn secondary" onClick={() => setDialog('edit')}>
          Edit holding
        </button>
        <DeleteButton
          path={`/investments/${id}`}
          label="Delete holding and history"
          onDone={() => {
            window.location.href = '/investments';
          }}
        />
      </div>
      {dialog === 'edit' && <HoldingDialog existing={h.holding} onClose={() => setDialog(null)} />}
      {dialog === 'entry' && (
        <Dialog
          title="A little more for the future"
          submit="Add entry"
          onClose={() => setDialog(null)}
          onSubmit={async (f) => {
            await save.mutateAsync({
              path: `/investments/${id}/entries`,
              body: {
                date: str(f, 'date'),
                kind: str(f, 'kind'),
                amount: amount(f),
                units: str(f, 'units') || null,
              },
            });
          }}
        >
          <Field label="Entry type">
            <select name="kind">
              <option value="buy">Buy / top-up</option>
              <option value="sell">Sell / withdraw</option>
            </select>
          </Field>
          <AmountField />
          <Field label="Date">
            <input type="date" name="date" required defaultValue={today()} />
          </Field>
          <Field label="Units (optional)">
            <input name="units" inputMode="decimal" pattern="\d+(\.\d{1,8})?" />
          </Field>
        </Dialog>
      )}
      {dialog === 'valuation' && (
        <Dialog
          title="Update current value"
          submit="Save valuation"
          onClose={() => setDialog(null)}
          onSubmit={async (f) => {
            await save.mutateAsync({
              path: `/investments/${id}/valuations`,
              body: { date: str(f, 'date'), value: amount(f) },
            });
          }}
        >
          <AmountField label="Current value" value={h.current} min="0" />
          <Field label="Valuation date">
            <input type="date" name="date" required defaultValue={today()} />
          </Field>
          <p className="hint">
            Enter the total market value of the holding, including all units. Each update stays in
            your value history.
          </p>
        </Dialog>
      )}
    </>
  );
}
