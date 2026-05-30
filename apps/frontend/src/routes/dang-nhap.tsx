import { useState, type FormEvent } from 'react';
import { createFileRoute, useNavigate, useRouter, Link } from '@tanstack/react-router';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { login as apiLogin } from '@/api/auth';
import { useAuthStore } from '@/stores/auth-store';
import { AuthShell } from '@/components/auth/AuthShell';
import { GoogleButton } from '@/components/auth/GoogleButton';

export const Route = createFileRoute('/dang-nhap')({
  component: SignInPage,
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === 'string' ? search.redirect : '/tu-sach',
  }),
});

function SignInPage() {
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canSubmit = email.length > 0 && password.length > 0 && !busy;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { user } = await apiLogin(email, password);
      setUser(user);
      await router.invalidate();
      void navigate({ to: redirect });
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 401) setError('Sai email hoặc mật khẩu.');
      else if (status === 429) setError('Đăng nhập quá nhiều lần. Thử lại sau ít phút.');
      else setError('Không kết nối được máy chủ. Thử lại sau.');
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      <div className="space-y-8">
        <header className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-fg-muted">
            CHÀO MỪNG TRỞ LẠI
          </p>
          <h1 className="font-sans text-heading-lg text-fg">Đăng nhập</h1>
          <p className="text-body-sm text-fg-muted">
            Tiếp tục đọc nơi bạn đã dừng lại.
          </p>
        </header>

        <GoogleButton redirect={redirect} label="Tiếp tục với Google" />

        <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.18em] text-fg-subtle">
          <span className="h-px flex-1 bg-border" />
          HOẶC
          <span className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={submit} className="space-y-5" noValidate>
          <div className="space-y-2">
            <label
              htmlFor="email"
              className="block text-[11px] font-medium uppercase tracking-[0.18em] text-fg-muted"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="block h-11 w-full rounded-md border border-border bg-bg-elevated px-3.5 text-body text-fg placeholder:text-fg-subtle transition-shadow duration-fast focus:border-accent/40 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:shadow-glow-pink-soft"
              placeholder="ban@example.com"
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="password"
              className="block text-[11px] font-medium uppercase tracking-[0.18em] text-fg-muted"
            >
              Mật khẩu
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPwd ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block h-11 w-full rounded-md border border-border bg-bg-elevated px-3.5 pr-11 text-body text-fg placeholder:text-fg-subtle transition-shadow duration-fast focus:border-accent/40 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:shadow-glow-pink-soft"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPwd((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-fg-muted transition-colors duration-fast hover:bg-bg-subtle hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                aria-label={showPwd ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
              >
                {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {error ? (
            <p className="text-body-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={!canSubmit}
            className="inline-flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-accent-gradient px-4 text-[14px] font-bold text-white shadow-glow-pink-soft transition-opacity duration-fast hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {busy ? "Đang đăng nhập…" : "Đăng nhập"}
          </button>
        </form>

        <p className="border-t border-border pt-6 text-center text-body-sm text-fg-muted">
          Chưa có tài khoản?{" "}
          <Link
            to="/dang-ky"
            search={{ redirect }}
            className="font-medium text-accent transition-opacity duration-fast hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Tạo tài khoản mới
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
