import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Camera, Check, Eye, EyeOff, Loader2, Trash2 } from 'lucide-react';
import { changePassword, me, updateMe, type User } from '@/api/auth';
import { useAuthStore } from '@/stores/auth-store';
import { resizeToDataUrl } from '@/lib/image-resize';

export const Route = createFileRoute('/tai-khoan')({
  beforeLoad: async () => {
    const user = await me();
    if (!user) throw redirect({ to: '/dang-nhap', search: { redirect: '/tai-khoan' } });
    useAuthStore.getState().setUser(user);
  },
  component: AccountPage,
});

function AccountPage() {
  const user = useAuthStore((s) => s.user)!;
  return (
    <div className="container max-w-3xl py-10 sm:py-14 space-y-10">
      <header className="space-y-2">
        <p className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground font-medium">
          Tài khoản
        </p>
        <h1 className="font-heading font-bold text-3xl sm:text-4xl tracking-tight">
          Hồ sơ của bạn
        </h1>
        <p className="text-sm text-muted-foreground">
          Cập nhật thông tin hiển thị, ảnh đại diện và mật khẩu.
        </p>
      </header>

      <AvatarCard user={user} />
      <ProfileCard user={user} />
      <PasswordCard />
    </div>
  );
}

function Card({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-background overflow-hidden">
      <div className="px-5 sm:px-6 py-4 border-b border-border/60">
        <h2 className="font-heading font-semibold text-lg">{title}</h2>
        {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
      </div>
      <div className="p-5 sm:p-6">{children}</div>
    </section>
  );
}

function syncUser(updated: User, qc: ReturnType<typeof useQueryClient>) {
  useAuthStore.getState().setUser(updated);
  qc.setQueryData(['me'], updated);
}

function AvatarCard({ user }: { user: User }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'upload' | 'remove' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [okFlash, setOkFlash] = useState(false);

  async function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Chỉ chấp nhận file ảnh.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Ảnh quá lớn (giới hạn 5MB).');
      return;
    }
    setError(null);
    setBusy('upload');
    try {
      const dataUrl = await resizeToDataUrl(file, 256, 'image/webp', 0.85);
      const updated = await updateMe({ image: dataUrl });
      syncUser(updated, qc);
      setOkFlash(true);
      setTimeout(() => setOkFlash(false), 1500);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 413 || status === 400) setError('Ảnh không hợp lệ.');
      else setError('Không tải được ảnh, thử lại.');
    } finally {
      setBusy(null);
    }
  }

  async function onRemove() {
    setError(null);
    setBusy('remove');
    try {
      const updated = await updateMe({ image: null as unknown as string });
      syncUser(updated, qc);
    } catch {
      setError('Không xoá được ảnh, thử lại.');
    } finally {
      setBusy(null);
    }
  }

  const initial = (user.name?.[0] ?? user.email[0] ?? 'U').toUpperCase();

  return (
    <Card title="Ảnh đại diện" description="Ảnh sẽ được crop vuông và nén còn 256×256.">
      <div className="flex items-center gap-5">
        <div className="relative">
          {user.image ? (
            <img
              src={user.image}
              alt={`Ảnh đại diện ${user.email}`}
              className="h-20 w-20 rounded-full object-cover border border-border"
            />
          ) : (
            <div className="h-20 w-20 rounded-full bg-foreground/10 text-foreground/80 flex items-center justify-center text-2xl font-heading font-semibold">
              {initial}
            </div>
          )}
          {okFlash && (
            <span
              aria-hidden
              className="absolute -bottom-1 -right-1 inline-flex items-center justify-center h-6 w-6 rounded-full bg-emerald-500 text-white shadow"
            >
              <Check className="h-3.5 w-3.5" />
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={onPick}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md text-sm border border-border hover:border-foreground/40 hover:bg-muted/60 transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy === 'upload' ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Camera className="h-4 w-4" aria-hidden />
            )}
            {user.image ? 'Đổi ảnh' : 'Tải ảnh lên'}
          </button>
          {user.image && (
            <button
              type="button"
              onClick={onRemove}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md text-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy === 'remove' ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Trash2 className="h-4 w-4" aria-hidden />
              )}
              Xoá ảnh
            </button>
          )}
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
    </Card>
  );
}

function ProfileCard({ user }: { user: User }) {
  const qc = useQueryClient();
  const [name, setName] = useState(user.name ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const dirty = name.trim() !== (user.name ?? '');

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!dirty || busy) return;
    setError(null);
    setOk(false);
    setBusy(true);
    try {
      const updated = await updateMe({ name: name.trim() });
      syncUser(updated, qc);
      setOk(true);
      setTimeout(() => setOk(false), 2000);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 400) setError('Tên không hợp lệ (1–60 ký tự).');
      else setError('Không cập nhật được, thử lại.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Thông tin cá nhân">
      <form onSubmit={submit} className="space-y-4">
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
            value={user.email}
            disabled
            className="w-full h-11 px-3.5 rounded-md border border-border bg-muted/40 text-sm text-muted-foreground cursor-not-allowed"
          />
          <p className="text-xs text-muted-foreground">Email không thể thay đổi.</p>
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="name"
            className="text-[11px] font-medium text-foreground/80 uppercase tracking-[0.18em]"
          >
            Tên hiển thị
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder="Tên hiển thị"
            className="w-full h-11 px-3.5 rounded-md border border-border bg-background text-sm focus:outline-none focus:border-foreground/40 focus:ring-2 focus:ring-primary/20 transition-all duration-200"
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={!dirty || busy}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-md bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Lưu thay đổi
          </button>
          {ok && (
            <span className="inline-flex items-center gap-1 text-sm text-emerald-600">
              <Check className="h-4 w-4" /> Đã lưu
            </span>
          )}
        </div>
      </form>
    </Card>
  );
}

function PasswordCard() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [showCur, setShowCur] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const nextTooShort = next.length > 0 && next.length < 8;
  const canSubmit = current.length > 0 && next.length >= 8 && !busy;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setOk(false);
    setBusy(true);
    try {
      await changePassword(current, next);
      setCurrent('');
      setNext('');
      setOk(true);
      setTimeout(() => setOk(false), 2500);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 401) setError('Mật khẩu hiện tại không đúng.');
      else if (status === 400) setError('Mật khẩu mới không hợp lệ.');
      else setError('Không đổi được mật khẩu, thử lại.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Bảo mật" description="Đổi mật khẩu định kỳ giúp tài khoản an toàn hơn.">
      <form onSubmit={submit} className="space-y-4">
        <PwdField
          id="current-password"
          label="Mật khẩu hiện tại"
          value={current}
          onChange={setCurrent}
          show={showCur}
          onToggleShow={() => setShowCur((v) => !v)}
          autoComplete="current-password"
        />
        <PwdField
          id="new-password"
          label="Mật khẩu mới"
          value={next}
          onChange={setNext}
          show={showNext}
          onToggleShow={() => setShowNext((v) => !v)}
          autoComplete="new-password"
          minLength={8}
          hint={nextTooShort ? 'Tối thiểu 8 ký tự' : 'Tối thiểu 8 ký tự'}
          hintError={nextTooShort}
        />

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={!canSubmit}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-md bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Đổi mật khẩu
          </button>
          {ok && (
            <span className="inline-flex items-center gap-1 text-sm text-emerald-600">
              <Check className="h-4 w-4" /> Đã đổi mật khẩu
            </span>
          )}
        </div>
      </form>
    </Card>
  );
}

function PwdField({
  id,
  label,
  value,
  onChange,
  show,
  onToggleShow,
  autoComplete,
  minLength,
  hint,
  hintError,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggleShow: () => void;
  autoComplete: string;
  minLength?: number;
  hint?: string;
  hintError?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="text-[11px] font-medium text-foreground/80 uppercase tracking-[0.18em]"
      >
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          minLength={minLength}
          className="w-full h-11 pl-3.5 pr-11 rounded-md border border-border bg-background text-sm focus:outline-none focus:border-foreground/40 focus:ring-2 focus:ring-primary/20 transition-all duration-200"
        />
        <button
          type="button"
          onClick={onToggleShow}
          aria-label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
          className="absolute right-1 top-1/2 -translate-y-1/2 inline-flex items-center justify-center h-9 w-9 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {hint && (
        <p
          className={`text-xs ${
            hintError ? 'text-destructive' : 'text-muted-foreground'
          }`}
        >
          {hint}
        </p>
      )}
    </div>
  );
}
