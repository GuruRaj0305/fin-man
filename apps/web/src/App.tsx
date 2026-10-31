import { createContext, useContext, useEffect, useState, type FormEvent } from 'react';
import { NavLink, Link, Route, Routes, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRegisterSW } from 'virtual:pwa-register/react';
import {
  LayoutDashboard,
  ArrowLeftRight,
  WalletCards,
  Landmark,
  Sprout,
  Flag,
  ChartNoAxesCombined,
  SlidersHorizontal,
  Settings,
  Moon,
  Sun,
  Menu,
  X,
  LogOut,
  Plus,
  ShieldCheck,
  ArrowUpRight,
  WifiOff,
  Download,
  Loader2,
} from 'lucide-react';
import type { Dataset } from '@folio/shared';
import { api, useSnapshot, useOverview, today, type Overview } from './lib';
import { Loading, ErrorState } from './components/ui';
import { TransactionDialog } from './components/forms';
import { Dashboard } from './pages/Dashboard';
import { Transactions } from './pages/Transactions';
import { Accounts, Loans, LoanDetail } from './pages/Accounts';
import { Investments, InvestmentDetail } from './pages/Investments';
import { Goals, Budgets } from './pages/Planning';
import { Reports } from './pages/Reports';
import { SettingsPage } from './pages/Settings';

type Workspace = {
  data: Dataset;
  view: Overview;
  current: Overview;
  month: string;
  setMonth: (v: string) => void;
  theme: string;
  setTheme: (v: string) => void;
};
const WorkspaceContext = createContext<Workspace | null>(null);
export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error('Workspace is unavailable');
  return context;
}
const nav = [
  { to: '/', label: 'Overview', icon: LayoutDashboard },
  { to: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
  { to: '/accounts', label: 'Accounts', icon: WalletCards },
  { to: '/loans', label: 'Loans', icon: Landmark },
  { to: '/investments', label: 'Investments', icon: Sprout },
  { to: '/goals', label: 'Savings goals', icon: Flag },
  { to: '/budgets', label: 'Budgets', icon: SlidersHorizontal },
  { to: '/reports', label: 'Reports', icon: ChartNoAxesCombined },
  { to: '/settings', label: 'Settings', icon: Settings },
];
export function App() {
  const qc = useQueryClient(),
    auth = useQuery({
      queryKey: ['auth'],
      queryFn: () => api<{ needs_setup: boolean; authenticated: boolean }>('/auth/status'),
      retry: false,
    }),
    [online, setOnline] = useState(navigator.onLine);
  const [theme, setTheme] = useState(localStorage.getItem('folio-theme') ?? 'system');
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)'),
      apply = () =>
        document.documentElement.classList.toggle(
          'dark',
          theme === 'dark' || (theme === 'system' && media.matches),
        );
    apply();
    media.addEventListener('change', apply);
    localStorage.setItem('folio-theme', theme);
    return () => media.removeEventListener('change', apply);
  }, [theme]);
  useEffect(() => {
    const on = () => setOnline(true),
      off = () => setOnline(false),
      expired = () => {
        qc.setQueryData(['auth'], { needs_setup: false, authenticated: false });
        qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'auth' });
      };
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    window.addEventListener('session-expired', expired);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      window.removeEventListener('session-expired', expired);
    };
  }, [qc]);
  const {
    needRefresh: [refresh, setRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  return (
    <>
      {!online && (
        <div className="offline-banner" role="status">
          <WifiOff size={16} /> You’re offline. Previously loaded information is read-only; connect
          to save changes.
        </div>
      )}
      {refresh && (
        <div className="update-banner">
          A fresh version of Folio is ready.
          <button onClick={() => void updateServiceWorker(true)}>Update app</button>
          <button aria-label="Dismiss update" onClick={() => setRefresh(false)}>
            <X size={15} />
          </button>
        </div>
      )}
      {auth.isPending ? (
        <Loading />
      ) : auth.isError ? (
        <div className="auth-error">
          <Brand />
          <ErrorState
            error={
              online
                ? auth.error
                : new Error(
                    'Your app shell is available offline. Connect to sign in and load your finances.',
                  )
            }
            retry={() => void auth.refetch()}
          />
        </div>
      ) : auth.data.authenticated ? (
        <WorkspaceApp theme={theme} setTheme={setTheme} />
      ) : (
        <Auth setup={auth.data.needs_setup} />
      )}
    </>
  );
}
function Brand() {
  return (
    <Link to="/" className="brand">
      <span className="brand-symbol">
        f<span>·</span>
      </span>
      <span>
        folio<span className="brand-dot">.</span>
      </span>
    </Link>
  );
}
function Auth({ setup }: { setup: boolean }) {
  const qc = useQueryClient(),
    [error, setError] = useState(''),
    [pending, setPending] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setError('');
    if (setup && f.get('password') !== f.get('confirm')) {
      setError('Your passwords do not match');
      return;
    }
    setPending(true);
    try {
      await api(setup ? '/auth/setup' : '/auth/login', 'POST', {
        password: String(f.get('password')),
      });
      await qc.invalidateQueries({ queryKey: ['auth'] });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  }
  return (
    <main className="auth-layout">
      <section className="auth-story">
        <Brand />
        <div>
          <span className="pill light">A LITTLE CLARITY GOES A LONG WAY</span>
          <h1>
            Your money.
            <br />
            Your pace.
            <br />
            <em>Your future.</em>
          </h1>
          <p>
            A quiet place to see the whole picture.
            <br />
            Spend thoughtfully. Save with purpose.
            <br />
            Watch the little things grow.
          </p>
          <div className="auth-art" aria-hidden="true">
            <div className="art-bar b1" />
            <div className="art-bar b2" />
            <div className="art-bar b3" />
            <div className="art-bar b4" />
            <div className="art-circle">
              <Sprout size={45} strokeWidth={1.3} />
            </div>
            <span>Small steps. Lasting growth.</span>
          </div>
        </div>
        <span className="auth-foot">
          <ShieldCheck size={16} /> Private by design. Entirely yours.
        </span>
      </section>
      <section className="auth-form-side">
        <div className="auth-mobile-brand">
          <Brand />
        </div>
        <form className="auth-form" onSubmit={submit}>
          <div className="eyebrow">{setup ? 'YOUR NEXT CHAPTER' : 'WELCOME BACK'}</div>
          <h2>{setup ? 'Make yourself at home.' : 'A little peace of mind.'}</h2>
          <p>
            {setup
              ? 'Set a password to create your private finance workspace. One person, one place for everything.'
              : 'Sign in to pick up where you left off.'}
          </p>
          <label className="field">
            <span>{setup ? 'Create a password' : 'Password'}</span>
            <input
              name="password"
              aria-label={setup ? 'Create a password' : 'Password'}
              type="password"
              autoComplete={setup ? 'new-password' : 'current-password'}
              required
              minLength={12}
              maxLength={128}
              placeholder="At least 12 characters"
              autoFocus
            />
          </label>
          {setup && (
            <label className="field">
              <span>Confirm password</span>
              <input
                name="confirm"
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={128}
                placeholder="One more time"
              />
            </label>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="btn primary auth-submit" disabled={pending || !navigator.onLine}>
            {pending ? <Loader2 size={18} className="spin" /> : null}
            {pending ? 'Opening your workspace…' : setup ? 'Create my workspace' : 'Sign in'}
            <ArrowUpRight size={18} />
          </button>
          <div className="auth-reassurance">
            <ShieldCheck size={16} />
            <span>
              No signups. No trackers. No distractions.
              <br />
              Your financial information stays in your own database.
            </span>
          </div>
        </form>
        <span className="auth-bottom">A more considered relationship with money.</span>
      </section>
    </main>
  );
}
function WorkspaceApp({ theme, setTheme }: { theme: string; setTheme: (v: string) => void }) {
  const snapshot = useSnapshot(),
    [month, setMonth] = useState(today().slice(0, 7)),
    overview = useOverview(month),
    current = useOverview(today().slice(0, 7)),
    [drawer, setDrawer] = useState(false),
    [quick, setQuick] = useState(false),
    [logoutError, setLogoutError] = useState(''),
    [install, setInstall] = useState<Event | null>(null);
  const location = useLocation(),
    qc = useQueryClient();
  useEffect(() => {
    setDrawer(false);
    window.scrollTo(0, 0);
  }, [location.pathname]);
  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault();
      setInstall(event);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);
  const logout = async () => {
    try {
      await api('/auth/logout', 'POST', {});
      qc.setQueryData(['auth'], { needs_setup: false, authenticated: false });
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'auth' });
    } catch (e) {
      setLogoutError((e as Error).message);
    }
  };
  const name =
    nav.find((n) => (n.to === '/' ? location.pathname === '/' : location.pathname.startsWith(n.to)))
      ?.label ?? 'Overview';
  return (
    <div className="app-layout">
      {drawer && (
        <button
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setDrawer(false)}
        />
      )}
      <aside className={`sidebar ${drawer ? 'is-open' : ''}`}>
        <div className="sidebar-brand">
          <Brand />
          <button
            className="icon-btn mobile-only"
            aria-label="Close navigation"
            onClick={() => setDrawer(false)}
          >
            <X size={20} />
          </button>
        </div>
        <div className="workspace-name">
          <span className="workspace-avatar">Y</span>
          <div>
            Personal workspace<small>Just you & your future</small>
          </div>
          <span className="tiny-dot" />
        </div>
        <span className="nav-label">YOUR FINANCES</span>
        <nav aria-label="Main navigation">
          {nav.slice(0, 5).map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'}>
              <n.icon size={19} strokeWidth={1.7} />
              {n.label}
            </NavLink>
          ))}
          <span className="nav-label spaced">A LITTLE PLANNING</span>
          {nav.slice(5, 8).map((n) => (
            <NavLink key={n.to} to={n.to}>
              <n.icon size={19} strokeWidth={1.7} />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <Sprout size={22} />
            <p>
              Good things take time.
              <br />
              <strong>Keep growing.</strong>
            </p>
          </div>
          <NavLink to="/settings">
            <Settings size={19} />
            Settings
          </NavLink>
          <button onClick={() => void logout()} className="logout">
            <LogOut size={18} />
            Sign out
          </button>
          {logoutError && (
            <p role="alert" className="form-error">
              {logoutError}
            </p>
          )}
          <span className="sidebar-private">
            <ShieldCheck size={12} />
            Your money stays yours.
          </span>
        </div>
      </aside>
      <div className="main-wrap">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-btn mobile-only"
              aria-label="Open navigation"
              onClick={() => setDrawer(true)}
            >
              <Menu size={21} />
            </button>
            <span>Personal workspace</span>
            <span className="breadcrumb-sep">/</span>
            <strong>{name}</strong>
          </div>
          <div className="header-actions">
            {install && (
              <button
                className="icon-btn"
                aria-label="Install Folio"
                onClick={async () => {
                  await (install as Event & { prompt: () => Promise<void> }).prompt();
                  setInstall(null);
                }}
              >
                <Download size={18} />
              </button>
            )}
            <button
              className="icon-btn theme-toggle"
              aria-label="Toggle dark mode"
              onClick={() =>
                setTheme(document.documentElement.classList.contains('dark') ? 'light' : 'dark')
              }
            >
              {theme === 'dark' ||
              (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches) ? (
                <Sun size={18} />
              ) : (
                <Moon size={18} />
              )}
            </button>
            <span className="header-divider" />
            <span className="user-avatar" aria-label="Your workspace">
              Y
            </span>
          </div>
        </header>
        <main className="main-content">
          {snapshot.isPending || overview.isPending || current.isPending ? (
            <Loading />
          ) : snapshot.isError || overview.isError || current.isError ? (
            <ErrorState
              error={snapshot.error ?? overview.error ?? current.error!}
              retry={() => {
                void snapshot.refetch();
                void overview.refetch();
                void current.refetch();
              }}
            />
          ) : (
            <WorkspaceContext.Provider
              value={{
                data: snapshot.data,
                view: overview.data,
                current: current.data,
                month,
                setMonth,
                theme,
                setTheme,
              }}
            >
              <Routes>
                <Route path="/" element={<Dashboard onQuick={() => setQuick(true)} />} />
                <Route path="/transactions" element={<Transactions />} />
                <Route path="/accounts" element={<Accounts />} />
                <Route path="/loans" element={<Loans />} />
                <Route path="/loans/:id" element={<LoanDetail />} />
                <Route path="/investments" element={<Investments />} />
                <Route path="/investments/:id" element={<InvestmentDetail />} />
                <Route path="/goals" element={<Goals />} />
                <Route path="/budgets" element={<Budgets />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route
                  path="*"
                  element={
                    <div className="empty">
                      <h1>A little off track.</h1>
                      <Link className="btn primary" to="/">
                        Back to overview
                      </Link>
                    </div>
                  }
                />
              </Routes>
              {quick && <TransactionDialog data={snapshot.data} onClose={() => setQuick(false)} />}
            </WorkspaceContext.Provider>
          )}
        </main>
        <footer className="page-footer">
          <span>Made for a little more peace of mind.</span>
          <span>Folio · Personal finance</span>
        </footer>
      </div>
      <nav className="bottom-nav" aria-label="Mobile navigation">
        <NavLink to="/" end>
          <LayoutDashboard size={21} />
          <span>Overview</span>
        </NavLink>
        <NavLink to="/transactions">
          <ArrowLeftRight size={21} />
          <span>Activity</span>
        </NavLink>
        <button
          className="mobile-add"
          aria-label="Quick add transaction"
          disabled={!snapshot.data || !navigator.onLine}
          onClick={() => setQuick(true)}
        >
          <Plus size={24} />
        </button>
        <NavLink to="/accounts">
          <WalletCards size={21} />
          <span>Accounts</span>
        </NavLink>
        <button onClick={() => setDrawer(true)}>
          <Menu size={21} />
          <span>More</span>
        </button>
      </nav>
    </div>
  );
}
export function MonthPicker() {
  const { month, setMonth } = useWorkspace();
  return (
    <label className="month-picker">
      <span className="sr-only">Selected month</span>
      <input
        aria-label="Selected month"
        type="month"
        value={month}
        onChange={(e) => {
          if (e.target.value) setMonth(e.target.value);
        }}
      />
    </label>
  );
}
