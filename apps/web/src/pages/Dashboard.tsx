import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  ArrowDownLeft,
  ArrowRight,
  Wallet,
  TrendingUp,
  Landmark,
  Sprout,
  Plus,
  ChevronRight,
} from 'lucide-react';
import { useWorkspace, MonthPicker } from '../App';
import { displayDate, percent } from '../lib';
import { PageHeading, Money, Empty, Progress, SectionTitle } from '../components/ui';
import { CashFlowChart, ExpenseChart, WealthChart, InvestmentChart } from '../components/charts';
export function Dashboard({ onQuick }: { onQuick: () => void }) {
  const { view, data, month } = useWorkspace();
  const monthName = new Date(`${month}-01T12:00:00`).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  });
  return (
    <>
      <PageHeading
        eyebrow="YOUR FINANCIAL PICTURE"
        title="A little clarity. A lot of possibility."
        description="Everything you’re building, all in one place."
        action={
          <div className="heading-actions">
            <MonthPicker />
            <button className="btn primary" onClick={onQuick} disabled={!navigator.onLine}>
              <Plus size={17} />
              Quick add
            </button>
          </div>
        }
      />
      <div className="overview-grid">
        <section className="net-worth-card">
          <div className="net-worth-top">
            <span>
              <Wallet size={17} />
              TOTAL NET WORTH
            </span>
            <span className="pill light">INR</span>
          </div>
          <div className="net-worth-number">
            <Money value={view.net_worth} />
          </div>
          <p>Your assets, less what you owe.</p>
          <div className="net-worth-bottom">
            <span>
              <span className="tiny-dot" />
              As of {displayDate(view.as_of)}
            </span>
            <Link to="/accounts">
              View accounts
              <ArrowUpRight size={16} />
            </Link>
          </div>
          <div className="hero-rings" aria-hidden="true" />
        </section>
        <div className="summary-grid">
          <div className="stat-card">
            <div className="stat-label">
              Money in
              <span className="stat-icon income">
                <ArrowDownLeft size={16} />
              </span>
            </div>
            <strong>
              <Money value={view.income} />
            </strong>
            <small>Income · {monthName}</small>
          </div>
          <div className="stat-card">
            <div className="stat-label">
              Money out
              <span className="stat-icon expense">
                <ArrowUpRight size={16} />
              </span>
            </div>
            <strong>
              <Money value={view.expense} />
            </strong>
            <small>Expenses · {monthName}</small>
          </div>
          <div className="stat-card">
            <div className="stat-label">
              Savings rate
              <span className="stat-icon">
                <Sprout size={16} />
              </span>
            </div>
            <strong>{percent(view.savings_rate)}</strong>
            <small>Of this month’s income</small>
          </div>
          <div className="stat-card">
            <div className="stat-label">
              Investment returns
              <span className="stat-icon">
                <TrendingUp size={16} />
              </span>
            </div>
            <strong className={view.investment_profit < 0 ? 'negative' : 'positive'}>
              <Money value={view.investment_profit} />
            </strong>
            <small>
              <span className={view.investment_profit < 0 ? 'negative' : 'positive'}>
                {percent(view.investment_return)}
              </span>{' '}
              · overall return
            </small>
          </div>
        </div>
      </div>
      <div className="insight-strip">
        <span>
          <Landmark size={17} />A little perspective
        </span>
        <p>
          Total loan outstanding{' '}
          <strong>
            <Money value={view.loan_outstanding} />
          </strong>
        </p>
        <Link to="/loans">
          See your repayment journey
          <ArrowRight size={15} />
        </Link>
      </div>
      <div className="dashboard-charts">
        <section className="panel">
          <SectionTitle
            title="The ebb & flow"
            description="Income and expenses over the last 12 months"
            action={
              <span className="chart-key">
                <i />
                Income
                <i />
                Expenses
              </span>
            }
          />
          <CashFlowChart data={view.history} />
        </section>
        <section className="panel">
          <SectionTitle title="Where it all goes" description={`Your spending in ${monthName}`} />
          <ExpenseChart data={view.categories.filter((c) => c.type === 'expense')} />
        </section>
      </div>
      <div className="dashboard-lower">
        <section className="panel">
          <SectionTitle
            title="The latest little things"
            description="Your recent activity this month"
            action={
              <Link className="text-link" to="/transactions">
                View all
                <ArrowRight size={15} />
              </Link>
            }
          />
          {view.recent.length ? (
            <div className="activity-list">
              {view.recent.map((t) => (
                <div className="activity-row" key={t.id}>
                  <span className={`activity-icon ${t.type}`}>
                    {t.type === 'income' ? (
                      <ArrowDownLeft size={18} />
                    ) : t.type === 'transfer' ? (
                      <ArrowRight size={18} />
                    ) : (
                      <ArrowUpRight size={18} />
                    )}
                  </span>
                  <div className="activity-description">
                    <strong>
                      {t.note ||
                        data.categories.find((c) => c.id === t.category_id)?.name ||
                        'Transfer'}
                    </strong>
                    <small>
                      {data.accounts.find((a) => a.id === t.account_id)?.name} <span>·</span>{' '}
                      {displayDate(t.date)}
                    </small>
                  </div>
                  <div className="activity-amount">
                    <strong className={t.type === 'income' ? 'positive' : ''}>
                      {t.type === 'income' ? '+' : t.type === 'expense' ? '−' : ''}
                      <Money value={t.amount} />
                    </strong>
                    <small>
                      {data.categories.find((c) => c.id === t.category_id)?.name ??
                        'Between accounts'}
                    </small>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty title="Your story starts here">
              Add your first transaction to see it take shape.
            </Empty>
          )}
        </section>
        <section className="panel goals-panel">
          <SectionTitle
            title="Little by little"
            description="The things you’re saving for"
            action={
              <Link to="/goals" className="icon-btn" aria-label="View savings goals">
                <ChevronRight size={20} />
              </Link>
            }
          />
          {view.goals.length ? (
            view.goals.slice(0, 3).map((g) => (
              <div className="mini-goal" key={g.id}>
                <div>
                  <span className="goal-icon">
                    <Sprout size={19} />
                  </span>
                  <strong>{g.name}</strong>
                  <small>{Math.round(g.percent)}%</small>
                </div>
                <Progress value={g.percent} label={g.name} />
                <p>
                  <Money value={g.saved} />
                  <span>
                    of <Money value={g.target_amount} />
                  </span>
                </p>
              </div>
            ))
          ) : (
            <Empty title="Something to look forward to">
              Give your savings a purpose with a goal.
            </Empty>
          )}
          <Link className="goal-link" to="/goals">
            Small steps make big things possible.
            <ArrowUpRight size={16} />
          </Link>
        </section>
      </div>
      <div className="two-col">
        <section className="panel">
          <SectionTitle title="The bigger picture" description="Your net worth over time" />
          <WealthChart data={view.history} />
        </section>
        <section className="panel">
          <SectionTitle title="Room to grow" description="Investment value and net contributions" />
          <InvestmentChart
            data={view.history.map((h) => ({
              date: h.month,
              value: h.value,
              invested: h.invested,
            }))}
          />
        </section>
      </div>
      <p className="data-note">
        Dashboard totals are in INR. Other currencies are shown separately in Accounts. Valuations
        are manual snapshots.
      </p>
    </>
  );
}
