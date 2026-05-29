import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, BookText, CheckCircle2, Layers } from 'lucide-react';
import { getStoryBySlug, listChapters } from '@/api/stories';
import { ChapterList } from '@/components/reader/ChapterList';
import { BookmarkToggle } from '@/components/reader/BookmarkToggle';

export const Route = createFileRoute('/truyen/$slug/')({
  component: StoryDetail,
  validateSearch: (s: Record<string, unknown>) => ({ page: Number(s.page) || 1 }),
});

const STATUS_META = {
  completed: { label: 'Hoàn thành', icon: CheckCircle2, tone: 'bg-foreground text-background' },
  ongoing: { label: 'Đang ra', icon: Layers, tone: 'bg-[hsl(var(--color-cta))] text-white' },
  dropped: { label: 'Tạm dừng', icon: Layers, tone: 'bg-muted text-foreground' },
  unknown: { label: '—', icon: Layers, tone: 'bg-muted text-foreground' },
} as const;

function StoryDetail() {
  const { slug } = Route.useParams();
  const { page } = Route.useSearch();

  const storyQ = useQuery({
    queryKey: ['story', slug],
    queryFn: () => getStoryBySlug(slug),
  });

  const chaptersQ = useQuery({
    queryKey: ['chapters', slug, page],
    queryFn: () => listChapters(slug, page),
  });

  if (storyQ.isLoading) {
    return (
      <div className="container py-20 text-center text-muted-foreground">
        Đang tải...
      </div>
    );
  }
  if (!storyQ.data) {
    return (
      <div className="container py-20 text-center">
        <p className="font-heading text-xl">Không tìm thấy truyện</p>
        <Link to="/" className="text-sm text-muted-foreground hover:underline mt-2 inline-block">
          ← Quay lại trang chủ
        </Link>
      </div>
    );
  }

  const s = storyQ.data;
  const status = STATUS_META[s.status] ?? STATUS_META.unknown;
  const StatusIcon = status.icon;

  const items = (chaptersQ.data?.items ?? []).map((c) => ({
    index: Number(c.index),
    title: c.title,
    isCrawled: c.status === 'crawled',
  }));

  return (
    <div>
      {/* Hero with backdrop */}
      <section className="relative overflow-hidden border-b border-border/60">
        {s.hasCover && (
          <div aria-hidden className="absolute inset-0 -z-10">
            <img
              src={`/api/v1/cover/${s.id}`}
              alt=""
              className="w-full h-full object-cover blur-2xl scale-110 opacity-30"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-background/85 to-background" />
          </div>
        )}

        <div className="container py-12 sm:py-16">
          <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-8 lg:gap-12 items-start">
            <div className="mx-auto md:mx-0 w-full max-w-[240px]">
              <div className="aspect-[3/4] rounded-xl overflow-hidden shadow-[0_30px_60px_-20px_rgba(0,0,0,0.4),0_0_0_1px_rgba(0,0,0,0.05)]">
                {s.hasCover ? (
                  <img
                    src={`/api/v1/cover/${s.id}`}
                    alt={`Bìa ${s.title}`}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-muted flex items-center justify-center text-muted-foreground">
                    <BookText className="h-12 w-12" />
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-5">
              <div>
                <p className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground font-medium mb-2">
                  Truyện chữ
                </p>
                <h1 className="font-heading font-bold text-3xl sm:text-4xl lg:text-5xl tracking-tight leading-[1.05]">
                  {s.title}
                </h1>
                <p className="mt-3 text-base text-muted-foreground">
                  {s.author ?? 'Khuyết danh'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 h-7 px-3 rounded-full text-xs font-medium ${status.tone}`}
                >
                  <StatusIcon className="h-3.5 w-3.5" />
                  {status.label}
                </span>
                <span className="inline-flex items-center h-7 px-3 rounded-full text-xs bg-muted/70 text-foreground/80">
                  {s.totalChapters} chương
                </span>
              </div>

              {s.genres.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {s.genres.map((g) => (
                    <span
                      key={g.slug}
                      className="inline-flex items-center h-6 px-2.5 rounded-full text-[11px] border border-border bg-background/60 text-foreground/70 hover:border-foreground/40 transition-colors duration-200"
                    >
                      {g.name}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3 pt-3">
                <Link
                  to="/truyen/$slug/chuong/$index"
                  params={{ slug: s.slug, index: '1' }}
                  className="group inline-flex items-center gap-2 h-11 px-6 rounded-full bg-[hsl(var(--color-cta))] text-white font-medium text-sm shadow-sm hover:shadow-md hover:opacity-95 transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--color-cta))] focus-visible:ring-offset-2"
                >
                  Đọc từ đầu
                  <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                </Link>
                <a
                  href="#muc-luc"
                  className="inline-flex items-center gap-2 h-11 px-5 rounded-full border border-border hover:border-foreground/40 hover:bg-muted/60 text-sm font-medium transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <Layers className="h-4 w-4" />
                  Mục lục
                </a>
                <BookmarkToggle storyId={s.id} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Description */}
      {s.description && (
        <section className="container py-12">
          <div className="max-w-3xl mx-auto">
            <p className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground font-medium mb-3">
              Giới thiệu
            </p>
            <div className="font-body text-base leading-[1.85] text-foreground/85 whitespace-pre-line first-letter:font-heading first-letter:text-5xl first-letter:font-bold first-letter:float-left first-letter:mr-2 first-letter:leading-[0.85] first-letter:mt-1">
              {s.description}
            </div>
          </div>
        </section>
      )}

      {/* Chapter list */}
      <section id="muc-luc" className="container pb-20 scroll-mt-24">
        <div className="max-w-5xl mx-auto">
          <div className="mb-6 flex items-end justify-between gap-4 flex-wrap">
            <div>
              <p className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground font-medium mb-2">
                Mục lục
              </p>
              <h2 className="font-heading font-bold text-2xl sm:text-3xl tracking-tight">
                Danh sách chương
              </h2>
            </div>
            <p className="text-xs text-muted-foreground">
              Trang {page} / {chaptersQ.data?.totalPages ?? 1}
              {' · '}
              {chaptersQ.data?.total ?? 0} chương
            </p>
          </div>
          <div className="h-px w-full bg-gradient-to-r from-border via-border to-transparent mb-6" />
          <ChapterList
            slug={s.slug}
            chapters={items}
            currentPage={page}
            totalPages={chaptersQ.data?.totalPages ?? 1}
          />
        </div>
      </section>
    </div>
  );
}
