import { useDeferredValue, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import type { UserMonitor } from '@folio/shared';
import { useWorkspace } from '../App';
import { api } from '../lib';
import { PageHeading, Loading, ErrorState, Empty } from '../components/ui';

const timestamp = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(value))
    : 'Not recorded';

export function AdminUsers() {
  const { user } = useWorkspace();
  const [search, setSearch] = useState(''),
    [page, setPage] = useState(1);
  const deferred = useDeferredValue(search);
  const query = new URLSearchParams({ search: deferred, page: String(page), limit: '20' });
  const users = useQuery({
    queryKey: ['admin-users', user.id, deferred, page],
    queryFn: () => api<UserMonitor>(`/admin/users?${query}`),
    retry: false,
    refetchInterval: 30000,
  });
  return (
    <>
      <PageHeading
        eyebrow="ADMINISTRATION"
        title="Current users"
        description="Registered accounts and their signed-in sessions. Financial records remain private to each account."
        action={
          <button
            className="btn secondary"
            onClick={() => void users.refetch()}
            disabled={users.isFetching || !navigator.onLine}
          >
            <RefreshCw size={16} />
            Refresh users
          </button>
        }
      />
      {users.isPending ? (
        <Loading />
      ) : users.isError ? (
        <ErrorState error={users.error} retry={() => void users.refetch()} />
      ) : (
        <>
          <div className="metric-grid three">
            <section className="panel metric">
              <small>Registered users</small>
              <strong>{users.data.stats.users}</strong>
            </section>
            <section className="panel metric">
              <small>Administrators</small>
              <strong>{users.data.stats.admins}</strong>
            </section>
            <section className="panel metric">
              <small>Users with active sessions</small>
              <strong>{users.data.stats.signed_in_users}</strong>
            </section>
          </div>
          <section className="panel">
            <div className="filter-toolbar admin-user-toolbar">
              <label className="search-input">
                <Search size={17} />
                <input
                  aria-label="Search users"
                  placeholder="Search by name or email"
                  value={search}
                  maxLength={120}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(1);
                  }}
                />
              </label>
              <span className="muted">Updates every 30 seconds</span>
            </div>
            {users.data.data.length === 0 ? (
              <Empty title="No matching users">Try a different name or email.</Empty>
            ) : (
              <div className="table-scroll">
                <table className="users-table">
                  <caption className="sr-only">Registered users</caption>
                  <thead>
                    <tr>
                      <th scope="col">User</th>
                      <th scope="col">Role</th>
                      <th scope="col">Joined</th>
                      <th scope="col">Last sign-in</th>
                      <th scope="col">Active sessions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.data.data.map((member) => (
                      <tr key={member.id}>
                        <td>
                          <strong>
                            {member.name}
                            {member.id === user.id ? ' (you)' : ''}
                          </strong>
                          <span className="user-email">
                            {member.email ?? 'Owner setup pending'}
                          </span>
                        </td>
                        <td>{member.role === 'admin' ? 'Administrator' : 'User'}</td>
                        <td>{timestamp(member.created_at)}</td>
                        <td>{timestamp(member.last_login_at)}</td>
                        <td>{member.active_sessions}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="pagination">
              <span>
                {users.data.total} matching {users.data.total === 1 ? 'user' : 'users'}
              </span>
              <div>
                <button
                  className="icon-btn"
                  aria-label="Previous users page"
                  disabled={page === 1}
                  onClick={() => setPage(page - 1)}
                >
                  <ChevronLeft size={18} />
                </button>
                <span>Page {page}</span>
                <button
                  className="icon-btn"
                  aria-label="Next users page"
                  disabled={page * 20 >= users.data.total}
                  onClick={() => setPage(page + 1)}
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          </section>
          <p className="muted">
            Active sessions are unexpired sign-ins, not a real-time online status.
          </p>
        </>
      )}
    </>
  );
}
