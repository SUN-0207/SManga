import { useState, type FormEvent } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Loader2, Search, Trash2, X } from 'lucide-react';
import {
  deleteUser,
  listAdminUsers,
  updateUserRole,
  type AdminUserRow,
} from '@/api/users';
import { useAuthStore } from '@/stores/auth-store';
import { EmptyState } from '@/components/ui/EmptyState';
import { EmptySearch } from '@/components/ui/illustrations/EmptySearch';
import { EmptyFolder } from '@/components/ui/illustrations/EmptyFolder';

export const Route = createFileRoute('/admin/users')({
  component: AdminUsersPage,
  validateSearch: (search: Record<string, unknown>) => ({
    page: typeof search.page === 'number' ? search.page : Number(search.page) || 1,
    q: typeof search.q === 'string' ? search.q : '',
  }),
});

function AdminUsersPage() {
  const { page, q } = Route.useSearch();
  const navigate = Route.useNavigate();
  const qc = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);

  const [searchInput, setSearchInput] = useState(q);
  const [confirmDelete, setConfirmDelete] = useState<AdminUserRow | null>(null);

  const usersQ = useQuery({
    queryKey: ['admin', 'users', { page, q }],
    queryFn: () => listAdminUsers({ page, limit: 25, q }),
    retry: false,
  });

  const roleM = useMutation({
    mutationFn: ({ id, role }: { id: string; role: 'user' | 'admin' }) => updateUserRole(id, role),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });

  const deleteM = useMutation({
    mutationFn: (id: string) => deleteUser(id),
    onSuccess: () => {
      setConfirmDelete(null);
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });

  function submitSearch(e: FormEvent) {
    e.preventDefault();
    void navigate({ search: { q: searchInput.trim(), page: 1 } });
  }

  function clearSearch() {
    setSearchInput('');
    void navigate({ search: { q: '', page: 1 } });
  }

  const data = usersQ.data;

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[11px] uppercase tracking-[0.28em] text-fg-muted font-medium mb-2">
            Quản trị
          </p>
          <h1 className="font-sans font-bold text-3xl sm:text-4xl tracking-tight text-fg">
            Người dùng
          </h1>
          <p className="text-body-sm text-fg-muted mt-2">
            Danh sách tài khoản trong hệ thống. Có thể đổi vai trò hoặc xoá tài khoản.
          </p>
        </div>
        {data && (
          <div className="text-body-sm text-fg-muted tabular-nums">
            <span className="font-medium text-fg">{data.total.toLocaleString('vi-VN')}</span> tài khoản
          </div>
        )}
      </div>

      <form onSubmit={submitSearch} role="search" aria-label="Tìm người dùng" className="flex items-center gap-2 max-w-lg">
        <div className="relative flex-1">
          <Search
            aria-hidden
            className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-fg-subtle pointer-events-none"
          />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Tìm theo email hoặc tên…"
            className="block h-11 w-full rounded-md border border-border bg-bg-elevated pl-9 pr-10 text-body text-fg placeholder:text-fg-subtle transition-shadow duration-fast focus:border-accent/40 focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
          {searchInput.length > 0 && (
            <button
              type="button"
              onClick={clearSearch}
              aria-label="Xoá tìm kiếm"
              className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center h-6 w-6 rounded-md text-fg-muted hover:bg-bg-subtle hover:text-fg transition-colors duration-fast"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <button
          type="submit"
          className="inline-flex h-10 items-center rounded-md bg-fg px-5 text-body-sm font-semibold text-bg transition-opacity duration-fast hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
        >
          Tìm
        </button>
      </form>

      <div className="overflow-hidden rounded-lg border border-border bg-bg-elevated">
        {usersQ.isLoading ? (
          <p className="text-body-sm text-fg-muted p-8 text-center">Đang tải...</p>
        ) : !data || data.items.length === 0 ? (
          q ? (
            <EmptyState
              illustration={<EmptySearch />}
              title="Không tìm thấy tài khoản"
              description={`Không có tài khoản nào khớp với "${q}".`}
            />
          ) : (
            <EmptyState
              illustration={<EmptyFolder />}
              title="Chưa có tài khoản nào"
              description="Hệ thống chưa có người dùng nào đăng ký."
            />
          )
        ) : (
          <table className="w-full text-left text-body-sm">
            <thead className="sticky top-0 z-10 bg-bg/95 backdrop-blur">
              <tr className="border-b border-border">
                <th className="px-5 py-3 w-12"></th>
                <th className="px-3 py-3 text-[11px] uppercase tracking-wider font-medium text-fg-muted">
                  Người dùng
                </th>
                <th className="px-3 py-3 w-32 text-[11px] uppercase tracking-wider font-medium text-fg-muted">
                  Vai trò
                </th>
                <th className="px-3 py-3 w-28 text-[11px] uppercase tracking-wider font-medium text-fg-muted">
                  Đăng nhập
                </th>
                <th className="px-3 py-3 w-36 text-[11px] uppercase tracking-wider font-medium text-fg-muted">
                  Ngày tạo
                </th>
                <th className="px-5 py-3 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((u) => {
                const isSelf = currentUser?.id === u.id;
                return (
                  <tr key={u.id} className="border-b border-border/60 last:border-0 transition-colors duration-fast hover:bg-bg-subtle/60">
                    <td className="px-5 py-3">
                      {u.image ? (
                        <img
                          src={u.image}
                          alt=""
                          className="h-8 w-8 rounded-full object-cover border border-border"
                        />
                      ) : (
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-bg-subtle text-body-sm font-semibold text-fg-muted">
                          {(u.name?.[0] ?? u.email[0] ?? 'U').toUpperCase()}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 min-w-0">
                      <div className="font-medium text-fg truncate">{u.name ?? '(chưa đặt tên)'}</div>
                      <div className="text-[11px] text-fg-muted truncate">
                        {u.email}
                        {isSelf && <span className="ml-2 text-fg-subtle">· bạn</span>}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <select
                        value={u.role}
                        disabled={isSelf || roleM.isPending}
                        onChange={(e) => roleM.mutate({ id: u.id, role: e.target.value as 'user' | 'admin' })}
                        aria-label={`Vai trò của ${u.email}`}
                        className="h-9 rounded-md border border-border bg-bg-elevated px-3 text-body-sm text-fg transition-colors duration-fast hover:border-border-strong focus:border-accent/40 focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <option value="user">Reader</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                    <td className="px-3 py-3 text-[11px] text-fg-muted">
                      {u.hasPassword ? 'Mật khẩu' : 'OAuth'}
                    </td>
                    <td className="px-3 py-3 text-[11px] text-fg-muted tabular-nums">
                      {new Date(u.createdAt).toLocaleDateString('vi-VN')}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(u)}
                        disabled={isSelf}
                        aria-label="Xoá người dùng"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-fg-muted transition-colors duration-fast hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {data && data.totalPages > 1 && (
          <div className="border-t border-border px-5 py-3 flex items-center justify-between text-[11px]">
            <span className="text-fg-muted">
              Trang {data.page} / {data.totalPages}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => navigate({ search: { q, page: Math.max(1, page - 1) } })}
                disabled={page === 1}
                className="inline-flex h-9 items-center gap-1 rounded-md border border-border bg-bg px-3 text-body-sm font-medium text-fg transition-colors duration-fast hover:border-border-strong hover:bg-bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ChevronLeft className="h-4 w-4" />
                Trước
              </button>
              <button
                type="button"
                onClick={() => navigate({ search: { q, page: Math.min(data.totalPages, page + 1) } })}
                disabled={page >= data.totalPages}
                className="inline-flex h-9 items-center gap-1 rounded-md border border-border bg-bg px-3 text-body-sm font-medium text-fg transition-colors duration-fast hover:border-border-strong hover:bg-bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                Sau
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {confirmDelete && (
        <DeleteConfirm
          user={confirmDelete}
          busy={deleteM.isPending}
          error={deleteM.error ? 'Không xoá được, thử lại.' : null}
          onCancel={() => {
            setConfirmDelete(null);
            deleteM.reset();
          }}
          onConfirm={() => deleteM.mutate(confirmDelete.id)}
        />
      )}
    </div>
  );
}

function DeleteConfirm({
  user,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  user: AdminUserRow;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [typed, setTyped] = useState('');
  const matches = typed === user.email;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-fg/40 px-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-user-title"
        className="w-full max-w-md rounded-xl border border-border bg-bg-elevated p-6 shadow-elev"
      >
        <h2 id="delete-user-title" className="font-sans text-heading-md text-fg">
          Xoá người dùng
        </h2>
        <p className="mt-2 text-body-sm text-fg-muted">
          Hành động này không thể hoàn tác. Để xác nhận, nhập email{" "}
          <span className="font-mono text-fg">{user.email}</span> bên dưới.
        </p>

        <input
          type="email"
          autoComplete="off"
          autoFocus
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={user.email}
          className="mt-4 block h-11 w-full rounded-md border border-border bg-bg px-3.5 text-body text-fg placeholder:text-fg-subtle focus:border-destructive/40 focus:outline-none focus:ring-2 focus:ring-destructive/40"
        />

        {error ? (
          <p className="mt-2 text-body-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-10 items-center rounded-md px-4 text-body-sm font-medium text-fg-muted transition-colors duration-fast hover:bg-bg-subtle hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Huỷ
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!matches || busy}
            className="inline-flex h-10 items-center gap-1.5 rounded-md bg-destructive px-4 text-body-sm font-semibold text-white transition-opacity duration-fast hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-2 focus-visible:ring-offset-bg-elevated disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            {busy ? 'Đang xoá…' : 'Xoá vĩnh viễn'}
          </button>
        </div>
      </div>
    </div>
  );
}
