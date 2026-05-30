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
      <header className="mb-8 space-y-2">
        <p className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground font-medium">
          Tài khoản
        </p>
        <h1 className="font-heading font-bold text-3xl sm:text-4xl tracking-tight">
          Tạo tài khoản
        </h1>
        <p className="text-sm text-muted-foreground">Bắt đầu hành trình đọc của bạn.</p>
      </header>

      <GoogleButton redirect={redirect} label="Đăng ký với Google" />

      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <label
            htmlFor="name"
            className="text-[11px] font-medium text-foreground/80 uppercase tracking-[0.18em]"
          >
            Tên hiển thị{' '}
            <span className="normal-case text-muted-foreground font-normal tracking-normal">
              (tuỳ chọn)
            </span>
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            placeholder="Bạn"
            className="w-full h-11 px-3.5 rounded-md border border-border bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:border-foreground/40 focus:ring-2 focus:ring-primary/20 transition-all duration-200"
          />
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="email"
            className="text-[11px] font-medium text-foreground/80 uppercase tracking-[0.18em]"
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            placeholder="ban@email.com"
            className="w-full h-11 px-3.5 rounded-md border border-border bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:border-foreground/40 focus:ring-2 focus:ring-primary/20 transition-all duration-200"
          />
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="password"
            className="text-[11px] font-medium text-foreground/80 uppercase tracking-[0.18em]"
          >
            Mật khẩu
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPwd ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              minLength={8}
              className="w-full h-11 pl-3.5 pr-11 rounded-md border border-border bg-background text-sm focus:outline-none focus:border-foreground/40 focus:ring-2 focus:ring-primary/20 transition-all duration-200"
            />
            <button
              type="button"
              onClick={() => setShowPwd((v) => !v)}
              aria-label={showPwd ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              className="absolute right-1 top-1/2 -translate-y-1/2 inline-flex items-center justify-center h-9 w-9 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p
            className={`text-xs transition-colors duration-200 ${
              pwdTooShort ? 'text-destructive' : 'text-muted-foreground'
            }`}
          >
            Tối thiểu 8 ký tự
          </p>
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full inline-flex items-center justify-center gap-2 h-11 rounded-md bg-[hsl(var(--color-cta))] text-white text-sm font-medium hover:opacity-90 transition-opacity duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--color-cta))] focus-visible:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {busy ? 'Đang tạo tài khoản...' : 'Tạo tài khoản'}
        </button>
      </form>

      <p className="mt-8 pt-6 border-t border-border/60 text-sm text-muted-foreground text-center">
        Đã có tài khoản?{' '}
        <Link
          to="/dang-nhap"
          search={{ redirect }}
          className="font-medium text-foreground hover:text-[hsl(var(--color-cta))] transition-colors duration-200"
        >
          Đăng nhập
        </Link>
      </p>
    </AuthShell>
  );
}
