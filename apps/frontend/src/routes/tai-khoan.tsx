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
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <header className="mb-8 space-y-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-fg-muted">
          TÀI KHOẢN
        </p>
        <h1 className="font-sans text-display-md text-fg">Hồ sơ của bạn</h1>
        <p className="text-body-sm text-fg-muted">
          Quản lý ảnh đại diện, tên hiển thị và mật khẩu.
        </p>
      </header>

      {/* Plan C inserts <ReadingStatsCard /> here, REPLACING this comment block. */}
      {/* <ReadingStatsCard /> — added in Plan C (Spec C differentiators) */}

      <div className="space-y-6">
        <AvatarCard user={user} />
        <ProfileCard user={user} />
        <PasswordCard />
      </div>
    </main>
  );
}

function Card({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-bg-elevated p-5 sm:p-6">
      <header className="space-y-1 border-b border-border/60 pb-4">
        <h2 className="font-sans text-heading-md text-fg">{title}</h2>
        {description ? (
          <p className="text-body-sm text-fg-muted">{description}</p>
        ) : null}
      </header>
      <div className="pt-5">{children}</div>
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

  const avatarUrl = user.image ?? null;
  const fallbackInitial = (user.name?.[0] ?? user.email[0] ?? 'U').toUpperCase();

  return (
    <Card title="Ảnh đại diện" description="Ảnh sẽ được crop vuông và nén còn 256×256.">
      <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
        <div className="relative h-20 w-20 flex-shrink-0">
          <div className="h-full w-full overflow-hidden rounded-full border border-border bg-bg-subtle">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-heading-md text-fg-muted">
                {fallbackInitial}
              </span>
            )}
          </div>
          {okFlash && (
            <span
              aria-hidden
              className="absolute -bottom-1 -right-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-accent text-white shadow"
            >
              <Check className="h-3.5 w-3.5" />
            </span>
          )}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border border-border-strong bg-bg-elevated px-4 text-body-sm font-medium text-fg transition-colors duration-fast hover:bg-bg-subtle focus-within:ring-2 focus-within:ring-accent">
            {busy === 'upload' ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Camera className="h-4 w-4" />
            )}
            Tải ảnh lên
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={onPick}
              disabled={busy !== null}
            />
          </label>

          {avatarUrl ? (
            <button
              type="button"
              onClick={onRemove}
              disabled={busy !== null}
              className="inline-flex h-10 items-center gap-2 rounded-md px-4 text-body-sm font-medium text-fg-muted transition-colors duration-fast hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy === 'remove' ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Xoá ảnh
            </button>
          ) : null}
        </div>
      </div>
      {error ? (
        <p role="alert" className="mt-3 text-body-sm text-destructive">
          {error}
        </p>
      ) : null}
    </Card>
  );
}

function ProfileCard({ user }: { user: User }) {
  const qc = useQueryClient();
  const [name, setName] = useState(user.name ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const isDirty = name.trim() !== (user.name ?? '');

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!isDirty || busy) return;
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
            value={user.email}
            disabled
            className="block h-11 w-full rounded-md border border-border bg-bg-elevated px-3.5 text-body text-fg placeholder:text-fg-subtle transition-shadow duration-fast focus:border-accent/40 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:shadow-glow-pink-soft disabled:bg-bg-subtle disabled:text-fg-muted"
          />
          <p className="text-body-sm text-fg-muted">Email không thể thay đổi.</p>
        </div>

        <div className="space-y-2">
          <label
            htmlFor="name"
            className="block text-[11px] font-medium uppercase tracking-[0.18em] text-fg-muted"
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
            className="block h-11 w-full rounded-md border border-border bg-bg-elevated px-3.5 text-body text-fg placeholder:text-fg-subtle transition-shadow duration-fast focus:border-accent/40 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:shadow-glow-pink-soft disabled:bg-bg-subtle disabled:text-fg-muted"
          />
        </div>

        {error ? (
          <p role="alert" className="text-body-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={!isDirty || busy}
            className="inline-flex h-10 items-center justify-center rounded-md bg-fg px-5 text-body-sm font-semibold text-bg transition-opacity duration-fast hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg focus-visible:ring-offset-2 focus-visible:ring-offset-bg-elevated disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden /> : null}
            {busy ? 'Đang lưu…' : 'Lưu thay đổi'}
          </button>
          {ok ? (
            <p className="inline-flex items-center gap-1.5 text-body-sm text-positive">
              <Check className="h-4 w-4" />
              Đã lưu
            </p>
          ) : null}
        </div>
      </form>
    </Card>
  );
}

function PasswordCard() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
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
          autoComplete="current-password"
        />
        <div>
          <PwdField
            id="new-password"
            label="Mật khẩu mới"
            value={next}
            onChange={setNext}
            autoComplete="new-password"
          />
          <div className="mt-2">
            {next.length >= 8 ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2.5 py-0.5 text-[11px] font-medium text-accent">
                <Check className="h-3 w-3" />
                Đủ điều kiện
              </span>
            ) : nextTooShort ? (
              <p className="text-body-sm text-destructive">
                Tối thiểu 8 ký tự
              </p>
            ) : (
              <p className="text-body-sm text-fg-muted">
                Tối thiểu 8 ký tự
              </p>
            )}
          </div>
        </div>

        {error ? (
          <p role="alert" className="text-body-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={!canSubmit}
            className="inline-flex h-10 items-center justify-center rounded-md bg-fg px-5 text-body-sm font-semibold text-bg transition-opacity duration-fast hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg focus-visible:ring-offset-2 focus-visible:ring-offset-bg-elevated disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden /> : null}
            {busy ? 'Đang đổi…' : 'Đổi mật khẩu'}
          </button>
          {ok ? (
            <p className="inline-flex items-center gap-1.5 text-body-sm text-positive">
              <Check className="h-4 w-4" />
              Đã đổi mật khẩu
            </p>
          ) : null}
        </div>
      </form>
    </Card>
  );
}

type PwdFieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
};

function PwdField({ id, label, value, onChange, autoComplete }: PwdFieldProps) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-2">
      <label
        htmlFor={id}
        className="block text-[11px] font-medium uppercase tracking-[0.18em] text-fg-muted"
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
          className="block h-11 w-full rounded-md border border-border bg-bg-elevated px-3.5 pr-11 text-body text-fg placeholder:text-fg-subtle transition-shadow duration-fast focus:border-accent/40 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:shadow-glow-pink-soft"
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-8 w-8 items-center justify-center rounded-md text-fg-muted transition-colors duration-fast hover:bg-bg-subtle hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          aria-label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
