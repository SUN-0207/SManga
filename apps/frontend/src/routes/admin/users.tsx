import { useState, type FormEvent } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ChevronLeft, ChevronRight, Loader2, Search, Trash2, X } from 'lucide-react';
import {
  deleteUser,
  listAdminUsers,
  updateUserRole,
  type AdminUserRow,
} from '@/api/users';
import { useAuthStore } from '@/stores/auth-store';

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
          <p className="text-body-sm text-fg-muted p-8 text-center">
            {q ? `Không tìm thấy tài khoản nào khớp với "${q}".` : 'Chưa có tài khoản nào.'}
          </p>
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
    <>
      <button
        type="button"
        onClick={onCancel}
        aria-label="Huỷ"
        className="fixed inset-0 z-40 bg-foreground/40 backdrop-blur-sm cursor-default"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-user-title"
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md rounded-xl border border-border bg-background shadow-xl"
      >
        <div className="px-6 py-5 border-b border-border/60 flex items-start gap-3">
          <div className="shrink-0 h-9 w-9 rounded-full bg-destructive/15 text-destructive flex items-center justify-center">
            <AlertTriangle className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <h2 id="delete-user-title" className="font-sans font-semibold text-lg text-fg">
              Xoá tài khoản
            </h2>
            <p className="text-body-sm text-fg-muted mt-1">
              Tài khoản, bookmark và tiến độ đọc của <span className="font-medium text-fg">{user.email}</span> sẽ
              bị xoá vĩnh viễn. Hành động này không thể hoàn tác.
            </p>
          </div>
        </div>
        <div className="px-6 py-5 space-y-4">
          <label className="block space-y-1.5">
            <span className="text-[11px] font-medium text-fg-muted uppercase tracking-[0.18em]">
              Nhập email để xác nhận
            </span>
            <input
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoFocus
              placeholder={user.email}
              className="w-full h-10 px-3 rounded-md border border-border bg-background text-body text-fg focus:outline-none focus:border-destructive/60 focus:ring-2 focus:ring-destructive/20 transition-all duration-200"
            />
          </label>
          {error && <p className="text-body-sm text-destructive">{error}</p>}
        </div>
        <div className="px-6 py-4 border-t border-border/60 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center h-9 px-3.5 rounded-md text-body-sm border border-border text-fg-muted hover:border-border-strong hover:bg-bg-subtle transition-colors duration-fast cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Huỷ
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!matches || busy}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md text-body-sm font-medium bg-destructive text-destructive-foreground hover:opacity-90 transition-opacity duration-fast cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Xoá vĩnh viễn
          </button>
        </div>
      </div>
    </>
  );
}
