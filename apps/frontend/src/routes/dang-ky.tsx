import { useState, type FormEvent } from 'react';
import { createFileRoute, useNavigate, useRouter, Link } from '@tanstack/react-router';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { login as apiLogin, register as apiRegister } from '@/api/auth';
import { useAuthStore } from '@/stores/auth-store';
import { AuthShell } from '@/components/auth/AuthShell';
import { GoogleButton } from '@/components/auth/GoogleButton';

export const Route = createFileRoute('/dang-ky')({
  component: SignUpPage,
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === 'string' ? search.redirect : '/tu-sach',
  }),
});

function SignUpPage() {
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pwdTooShort = password.length > 0 && password.length < 8;
  const canSubmit = email.length > 0 && password.length >= 8 && !busy;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setBusy(true);
    try {
      await apiRegister(email, password, name.trim() || undefined);
      const { user } = await apiLogin(email, password);
      setUser(user);
      await router.invalidate();
      void navigate({ to: redirect });
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 409) setError('Email đã có tài khoản. Vui lòng đăng nhập.');
      else if (status === 400 || status === 422)
        setError('Thông tin không hợp lệ. Kiểm tra email và mật khẩu.');
      else setError('Đăng ký không thành công. Thử lại sau.');
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      <div className="space-y-8">
        <header className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-fg-muted">
            TÀI KHOẢN MỚI
          </p>
          <h1 className="font-sans text-heading-lg text-fg">Tạo tài khoản</h1>
          <p className="text-body-sm text-fg-muted">
            Lưu truyện yêu thích, theo dõi tiến độ đọc, đồng bộ giữa các thiết bị.
          </p>
        </header>

        <GoogleButton redirect={redirect} label="Đăng ký với Google" />

        <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.18em] text-fg-subtle">
          <span className="h-px flex-1 bg-border" />
          HOẶC
          <span className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={submit} className="space-y-5">
          <div className="space-y-2">
            <label
              htmlFor="name"
              className="block text-[11px] font-medium uppercase tracking-[0.18em] text-fg-muted"
            >
              Tên hiển thị <span className="normal-case tracking-normal text-fg-subtle">(tuỳ chọn)</span>
            </label>
            <input
              id="name"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="block h-11 w-full rounded-md border border-border bg-bg-elevated px-3.5 text-body text-fg placeholder:text-fg-subtle transition-shadow duration-fast focus:border-accent/40 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:shadow-glow-pink-soft"
              placeholder="Bạn đọc"
            />
          </div>

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
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block h-11 w-full rounded-md border border-border bg-bg-elevated px-3.5 pr-11 text-body text-fg placeholder:text-fg-subtle transition-shadow duration-fast focus:border-accent/40 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:shadow-glow-pink-soft"
                placeholder="Tối thiểu 8 ký tự"
              />
              <button
                type="button"
                onClick={() => setShowPwd((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-8 w-8 items-center justify-center rounded-md text-fg-muted transition-colors duration-fast hover:bg-bg-subtle hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                aria-label={showPwd ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
              >
                {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p
              className={
                password.length === 0
                  ? "text-body-sm text-fg-muted"
                  : password.length >= 8
                    ? "text-body-sm text-positive"
                    : "text-body-sm text-destructive"
              }
            >
              {password.length === 0
                ? "Mật khẩu phải có ít nhất 8 ký tự."
                : password.length >= 8
                  ? "✓ Mật khẩu đủ dài."
                  : `Cần thêm ${8 - password.length} ký tự nữa.`}
            </p>
          </div>

          {error ? (
            <p className="text-body-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={!canSubmit}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-accent-gradient px-4 text-[14px] font-bold text-white shadow-glow-pink-soft transition-opacity duration-fast hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {busy ? "Đang tạo tài khoản…" : "Tạo tài khoản"}
          </button>
        </form>

        <p className="border-t border-border pt-6 text-center text-body-sm text-fg-muted">
          Đã có tài khoản?{" "}
          <Link
            to="/dang-nhap"
            search={{ redirect }}
            className="font-medium text-accent transition-opacity duration-fast hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Đăng nhập
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
