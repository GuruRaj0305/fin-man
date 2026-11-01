import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import type { Category } from '@folio/shared';
import { useWorkspace, MonthPicker } from '../App';
import { api, download } from '../lib';
import {
  PageHeading,
  Money,
  Loading,
  ErrorState,
  Empty,
  SectionTitle,
  Progress,
} from '../components/ui';
import { CashFlowChart, ExpenseChart } from '../components/charts';
export function Reports() {
  const { month, view, user } = useWorkspace(),
    [period, setPeriod] = useState('monthly'),
    [year, setYear] = useState(month.slice(0, 4)),
    [error, setError] = useState('');
  const query = new URLSearchParams({ year, ...(period === 'monthly' ? { month } : {}) }),
    report = useQuery({
      queryKey: ['reports', user.id, query.toString()],
      queryFn: () =>
        api<{ income: number; expense: number; categories: (Category & { amount: number })[] }>(
          `/reports?${query}`,
        ),
    });
  return (
    <>
      <PageHeading
        eyebrow="STEP BACK. SEE MORE."
        title="Your money tells a story."
        description="A little reflection goes a long way toward a more intentional tomorrow."
        action={
          <div className="heading-actions">
            <MonthPicker />
            <button
              className="btn secondary"
              onClick={async () => {
                try {
                  const from = period === 'monthly' ? `${month}-01` : `${year}-01-01`,
                    to =
                      period === 'monthly'
                        ? new Date(
                            Number(month.slice(0, 4)),
                            Number(month.slice(5)),
                            0,
                          ).toLocaleDateString('en-CA')
                        : `${year}-12-31`;
                  await download(
                    `/export/transactions.csv?from=${from}&to=${to}`,
                    `folio-${period === 'monthly' ? month : year}.csv`,
                  );
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              <Download size={16} />
              Export CSV
            </button>
          </div>
        }
      />
      <div className="report-controls">
        <div className="segmented">
          <button
            className={period === 'monthly' ? 'active' : ''}
            onClick={() => setPeriod('monthly')}
          >
            Monthly
          </button>
          <button
            className={period === 'yearly' ? 'active' : ''}
            onClick={() => setPeriod('yearly')}
          >
            Yearly
          </button>
        </div>
        {period === 'yearly' && (
          <label className="year-picker">
            Year
            <input
              aria-label="Report year"
              type="number"
              min="1900"
              max="9999"
              value={year}
              onChange={(e) => setYear(e.target.value)}
            />
          </label>
        )}
        <span className="muted small">Transfers excluded</span>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {report.isPending ? (
        <Loading />
      ) : report.isError ? (
        <ErrorState error={report.error} />
      ) : (
        <>
          <div className="metric-grid three">
            <div className="panel metric">
              <small>Total income</small>
              <strong>
                <Money value={report.data.income} />
              </strong>
            </div>
            <div className="panel metric">
              <small>Total expenses</small>
              <strong>
                <Money value={report.data.expense} />
              </strong>
            </div>
            <div className="panel metric">
              <small>Net savings</small>
              <strong
                className={report.data.income >= report.data.expense ? 'positive' : 'negative'}
              >
                <Money value={report.data.income - report.data.expense} />
              </strong>
            </div>
          </div>
          <div className="two-col">
            <section className="panel">
              <SectionTitle
                title="The year in perspective"
                description="Twelve months ending in your selected month"
              />
              <CashFlowChart data={view.history} />
            </section>
            <section className="panel">
              <SectionTitle title="Spending, a little closer" />
              <ExpenseChart
                data={report.data.categories
                  .filter((c) => c.type === 'expense')
                  .map((c) => ({ name: c.name, total: c.amount }))}
              />
            </section>
          </div>
          <section className="panel">
            <SectionTitle
              title="Category breakdown"
              description={period === 'monthly' ? month : year}
            />
            {report.data.categories.some((c) => c.amount) ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Category</th>
                      <th>Type</th>
                      <th>Share of type total</th>
                      <th className="align-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.data.categories
                      .filter((c) => c.amount > 0)
                      .sort((a, b) => b.amount - a.amount)
                      .map((c) => (
                        <tr key={c.id}>
                          <td>
                            <strong>{c.name}</strong>
                          </td>
                          <td>
                            <span className={`badge ${c.type}`}>{c.type}</span>
                          </td>
                          <td>
                            <Progress
                              value={
                                (c.amount /
                                  (c.type === 'income'
                                    ? report.data.income
                                    : report.data.expense)) *
                                100
                              }
                              label={`${c.name} share`}
                            />
                          </td>
                          <td className="align-right amount-cell">
                            <Money value={c.amount} />
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty title="A story yet to be written">
                Your summaries will appear as you add transactions.
              </Empty>
            )}
          </section>
        </>
      )}
    </>
  );
}
