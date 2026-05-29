import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, BookmarkX, History } from 'lucide-react';
import { bookmarksApi } from '@/api/bookmarks';
import { readingProgressApi } from '@/api/reading-progress';
import { me } from '@/api/auth';

export const Route = createFileRoute('/tu-sach')({
  beforeLoad: async () => {
    const user = await me();
    if (!user) {
      throw redirect({ to: '/dang-nhap', search: { redirect: '/tu-sach' } });
    }
  },
  component: Shelf,
});

function Shelf() {
  const bookmarks = useQuery({ queryKey: ['bookmarks'], queryFn: bookmarksApi.list });
  const progress = useQuery({
    queryKey: ['reading-progress'],
    queryFn: readingProgressApi.list,
  });

  return (
    <div className="container max-w-6xl py-10 sm:py-16 space-y-16">
      <div>
        <p className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground font-medium mb-2">
          Của bạn
        </p>
        <h1 className="font-heading font-bold text-3xl sm:text-4xl tracking-tight">
          Tủ sách
        </h1>
        <p className="text-muted-foreground text-sm mt-2 max-w-xl">
          Theo dõi truyện đang đọc và những truyện bạn đã đánh dấu để xem sau.
        </p>
      </div>

      <Section
        eyebrow="Đang đọc"
        title="Tiếp tục từ chỗ đã dừng"
        empty={(progress.data?.length ?? 0) === 0}
        emptyIcon={History}
        emptyText="Chưa có truyện nào đang đọc. Vào một chương bất kỳ và đọc 5 giây — chúng tôi sẽ tự ghi nhớ."
      >
        {(progress.data ?? []).map((p) => (
          <ContinueCard
            key={p.storyId}
            slug={p.slug}
            title={p.title}
            author={p.author}
            chapterIndex={Number(p.chapterIndex)}
            totalChapters={p.totalChapters}
            updatedAt={p.updatedAt}
          />
        ))}
      </Section>

      <Section
        eyebrow="Đã lưu"
        title="Truyện đã đánh dấu"
        empty={(bookmarks.data?.length ?? 0) === 0}
        emptyIcon={BookmarkX}
        emptyText='Chưa lưu truyện nào. Bấm "Lưu truyện" ở trang chi tiết để thêm vào đây.'
      >
        {(bookmarks.data ?? []).map((b) => (
          <BookmarkCard
            key={b.storyId}
            slug={b.slug}
            title={b.title}
            author={b.author}
            totalChapters={b.totalChapters}
          />
        ))}
      </Section>
    </div>
  );
}

function Section({
  eyebrow,
  title,
  children,
  empty,
  emptyIcon: Icon,
  emptyText,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
  empty: boolean;
  emptyIcon: typeof History;
  emptyText: string;
}) {
  return (
    <section className="space-y-6">
      <div>
        <p className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground font-medium mb-2">
          {eyebrow}
        </p>
        <h2 className="font-heading font-bold text-2xl sm:text-3xl tracking-tight">{title}</h2>
        <div className="mt-4 h-px w-full bg-gradient-to-r from-border via-border to-transparent" />
      </div>
      {empty ? (
        <div className="flex flex-col items-center text-center gap-3 py-12">
          <Icon className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground max-w-md">{emptyText}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{children}</div>
      )}
    </section>
  );
}

function ContinueCard({
  slug,
  title,
  author,
  chapterIndex,
  totalChapters,
  updatedAt,
}: {
  slug: string;
  title: string;
  author: string | null;
  chapterIndex: number;
  totalChapters: number;
  updatedAt: string;
}) {
  const pct = totalChapters > 0 ? Math.min(100, (chapterIndex / totalChapters) * 100) : 0;
  return (
    <Link
      to="/truyen/$slug/chuong/$index"
      params={{ slug, index: String(chapterIndex) }}
      className="group block rounded-xl border border-border bg-background p-5 hover:border-foreground/40 hover:shadow-md transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground font-medium mb-2">
        Tiếp tục Chương {chapterIndex}
      </p>
      <h3 className="font-heading font-semibold text-lg leading-tight tracking-tight line-clamp-2 group-hover:underline underline-offset-4 decoration-foreground/40 transition-all duration-200">
        {title}
      </h3>
      <p className="text-xs text-muted-foreground mt-1.5">{author ?? 'Khuyết danh'}</p>

      <div className="mt-4 space-y-1">
        <div className="flex items-baseline justify-between text-xs text-muted-foreground">
          <span>
            Chương {chapterIndex} / {totalChapters}
          </span>
          <span className="tabular-nums">{pct.toFixed(0)}%</span>
        </div>
        <div className="h-1 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-[hsl(var(--color-cta))] transition-[width] duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
        <span>Đọc lần cuối {formatRelative(updatedAt)}</span>
        <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}

function BookmarkCard({
  slug,
  title,
  author,
  totalChapters,
}: {
  slug: string;
  title: string;
  author: string | null;
  totalChapters: number;
}) {
  return (
    <Link
      to="/truyen/$slug"
      params={{ slug }}
      search={{ page: 1 }}
      className="group block rounded-xl border border-border bg-background p-5 hover:border-foreground/40 hover:shadow-md transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <h3 className="font-heading font-semibold text-lg leading-tight tracking-tight line-clamp-2 group-hover:underline underline-offset-4 decoration-foreground/40 transition-all duration-200">
        {title}
      </h3>
      <p className="text-xs text-muted-foreground mt-1.5">{author ?? 'Khuyết danh'}</p>
      <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
        <span>{totalChapters} chương</span>
        <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.round(diffMs / 60_000);
  if (min < 1) return 'vừa xong';
  if (min < 60) return `${min} phút trước`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} giờ trước`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day} ngày trước`;
  return new Date(iso).toLocaleDateString('vi-VN');
}
