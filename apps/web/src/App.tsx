import { createContext, useContext, useEffect, useState, type FormEvent } from 'react';
import { NavLink, Link, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
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
  Users,
} from 'lucide-react';
import type { Dataset, AuthStatus, User } from '@folio/shared';
import { api, useSnapshot, useOverview, today, type Overview } from './lib';
import { Loading, ErrorState } from './components/ui';
import { TransactionDialog } from './components/forms';
import { Dashboard } from './pages/Dashboard';
import { Transactions } from './pages/Transactions';
import { Accounts, Loans, LoanDetail } from './pages/Accounts';
import { AccountDetail } from './pages/AccountDetail';
import { Investments, InvestmentDetail } from './pages/Investments';
import { Goals, Budgets } from './pages/Planning';
import { Reports } from './pages/Reports';
import { SettingsPage } from './pages/Settings';
import { AdminUsers } from './pages/AdminUsers';
import { CurrencyContext } from './currency';

type Workspace = {
  user: User;
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
      queryFn: () => api<AuthStatus>('/auth/status'),
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
        qc.setQueryData<AuthStatus>(['auth'], (previous) =>
          previous ? { ...previous, authenticated: false, user: null } : previous,
        );
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
      ) : auth.data.authenticated && auth.data.user ? (
        auth.data.user.email === null ? (
          <CompleteProfile user={auth.data.user} />
        ) : (
          <WorkspaceApp
            key={auth.data.user.id}
            user={auth.data.user}
            theme={theme}
            setTheme={setTheme}
          />
        )
      ) : (
        <Auth status={auth.data} />
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
function Auth({ status }: { status: AuthStatus }) {
  const setup = status.needs_setup;
  const navigate = useNavigate();
  const qc = useQueryClient(),
    [error, setError] = useState(''),
    [pending, setPending] = useState(false),
    [mode, setMode] = useState<'login' | 'register' | 'legacy'>('login');
  const creating = setup || mode === 'register';
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setError('');
    if (creating && f.get('password') !== f.get('confirm')) {
      setError('Your passwords do not match');
      return;
    }
    setPending(true);
    try {
      await api(setup ? '/auth/setup' : creating ? '/auth/register' : '/auth/login', 'POST', {
        password: String(f.get('password')),
        ...(creating ? { name: String(f.get('name')) } : {}),
        ...(mode === 'legacy' && !creating ? {} : { email: String(f.get('email')) }),
      });
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'auth' });
      navigate('/', { replace: true });
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
          <div className="eyebrow">{creating ? 'YOUR NEXT CHAPTER' : 'WELCOME BACK'}</div>
          <h2>
            {setup
              ? 'Make yourself at home.'
              : creating
                ? 'A workspace of your own.'
                : 'A little peace of mind.'}
          </h2>
          <p>
            {creating
              ? 'Create your account for a private place to manage your finances.'
              : mode === 'legacy'
                ? 'Use your existing owner password. You can choose your login email next.'
                : 'Sign in with your email and password.'}
          </p>
          {creating && (
            <label className="field">
              <span>Your name</span>
              <input name="name" autoComplete="name" required maxLength={120} />
            </label>
          )}
          {(creating || mode !== 'legacy') && (
            <label className="field">
              <span>Email address</span>
              <input name="email" type="email" autoComplete="username" required maxLength={254} />
            </label>
          )}
          <label className="field">
            <span>{creating ? 'Create a password' : 'Password'}</span>
            <input
              name="password"
              aria-label={creating ? 'Create a password' : 'Password'}
              type="password"
              autoComplete={creating ? 'new-password' : 'current-password'}
              required
              minLength={12}
              maxLength={128}
              placeholder="At least 12 characters"
              autoFocus
            />
          </label>
          {creating && (
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
            {pending ? 'Opening your workspace…' : creating ? 'Create my workspace' : 'Sign in'}
            <ArrowUpRight size={18} />
          </button>
          {!setup && (
            <div className="auth-options">
              {(creating || status.registration_open) && (
                <button
                  type="button"
                  className="text-btn"
                  disabled={pending}
                  onClick={() => {
                    setMode(creating ? 'login' : 'register');
                    setError('');
                  }}
                >
                  {creating ? 'Already have an account? Sign in' : 'Create an account'}
                </button>
              )}
              {status.legacy_owner && !creating && (
                <button
                  type="button"
                  className="text-btn"
                  disabled={pending}
                  onClick={() => {
                    setMode(mode === 'legacy' ? 'login' : 'legacy');
                    setError('');
                  }}
                >
                  {mode === 'legacy'
                    ? 'Sign in with email'
                    : 'Existing owner? Sign in with your password'}
                </button>
              )}
            </div>
          )}
          <div className="auth-reassurance">
            <ShieldCheck size={16} />
            <span>
              Your account. Your finances. Your pace.
              <br />
              Your financial records are private to your account.
            </span>
          </div>
        </form>
        <span className="auth-bottom">A more considered relationship with money.</span>
      </section>
    </main>
  );
}
function CompleteProfile({ user }: { user: User }) {
  const qc = useQueryClient(),
    [error, setError] = useState(''),
    [pending, setPending] = useState(false);
  return (
    <main className="profile-layout">
      <Brand />
      <form
        className="auth-form"
        onSubmit={async (event) => {
          event.preventDefault();
          setError('');
          setPending(true);
          const form = new FormData(event.currentTarget);
          try {
            await api('/auth/profile', 'POST', {
              name: String(form.get('name')),
              email: String(form.get('email')),
            });
            await qc.invalidateQueries({ queryKey: ['auth'] });
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setPending(false);
          }
        }}
      >
        <div className="eyebrow">YOUR EXISTING WORKSPACE</div>
        <h2>Finish your account</h2>
        <p>
          Choose your name and login email. Your password and financial records are already here.
          This account is the administrator.
        </p>
        <label className="field">
          <span>Your name</span>
          <input
            name="name"
            autoComplete="name"
            defaultValue={user.name}
            required
            maxLength={120}
          />
        </label>
        <label className="field">
          <span>Email address</span>
          <input name="email" type="email" autoComplete="username" required maxLength={254} />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="btn primary auth-submit" disabled={pending || !navigator.onLine}>
          {pending ? 'Saving…' : 'Save account details'}
        </button>
      </form>
    </main>
  );
}
function WorkspaceApp({
  user,
  theme,
  setTheme,
}: {
  user: User;
  theme: string;
  setTheme: (v: string) => void;
}) {
  const snapshot = useSnapshot(user.id),
    [month, setMonth] = useState(today().slice(0, 7)),
    overview = useOverview(month, user.id),
    current = useOverview(today().slice(0, 7), user.id),
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
      qc.setQueryData<AuthStatus>(['auth'], (previous) =>
        previous ? { ...previous, authenticated: false, user: null } : previous,
      );
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'auth' });
    } catch (e) {
      setLogoutError((e as Error).message);
    }
  };
  const name =
    nav.find((n) => (n.to === '/' ? location.pathname === '/' : location.pathname.startsWith(n.to)))
      ?.label ?? (location.pathname === '/admin/users' ? 'Admin monitor' : 'Overview');
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
          <span className="workspace-avatar">{user.name.charAt(0).toUpperCase()}</span>
          <div>
            {user.name}
            <small>{user.role === 'admin' ? 'Administrator' : 'Personal workspace'}</small>
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
          {user.role === 'admin' && (
            <NavLink to="/admin/users">
              <Users size={19} />
              Admin monitor
            </NavLink>
          )}
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
              {user.name.charAt(0).toUpperCase()}
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
            <CurrencyContext.Provider value={snapshot.data.currency}>
              <WorkspaceContext.Provider
                value={{
                  user,
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
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/transactions" element={<Transactions />} />
                  <Route path="/accounts" element={<Accounts />} />
                  <Route path="/accounts/:id" element={<AccountDetail />} />
                  <Route path="/loans" element={<Loans />} />
                  <Route path="/loans/:id" element={<LoanDetail />} />
                  <Route path="/investments" element={<Investments />} />
                  <Route path="/investments/:id" element={<InvestmentDetail />} />
                  <Route path="/goals" element={<Goals />} />
                  <Route path="/budgets" element={<Budgets />} />
                  <Route path="/reports" element={<Reports />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route
                    path="/admin/users"
                    element={
                      user.role === 'admin' ? (
                        <AdminUsers />
                      ) : (
                        <ErrorState error={new Error('Administrator access is required.')} />
                      )
                    }
                  />
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
                {quick && (
                  <TransactionDialog
                    data={snapshot.data}
                    userId={user.id}
                    onClose={() => setQuick(false)}
                  />
                )}
              </WorkspaceContext.Provider>
            </CurrencyContext.Provider>
          )}
        </main>
        <footer className="page-footer">
          <span>Made for a little more peace of mind.</span>
          <span>Folio · Personal finance</span>
        </footer>
      </div>
      <button
        type="button"
        className="btn primary floating-quick-add"
        aria-label="Quick add transaction"
        aria-haspopup="dialog"
        disabled={!snapshot.data || !navigator.onLine}
        onClick={() => setQuick(true)}
      >
        <Plus size={22} aria-hidden="true" />
        Quick add
      </button>
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
