import { getStoryBySlug, listChapters } from '@/api/stories';
import { CommentSection } from '@/components/comments/CommentSection';
import { RatingControl } from '@/components/engagement/RatingControl';
import { ViewCount } from '@/components/engagement/ViewCount';
import { BookmarkToggle } from '@/components/reader/BookmarkToggle';
import { ChapterList } from '@/components/reader/ChapterList';
import { ReadingInsights } from '@/components/reader/ReadingInsights';
import { RecommendationSection } from '@/components/recommendations/RecommendationSection';
import { StoryCover } from '@/components/ui/StoryCover';
import { useTrackStoryView } from '@/hooks/use-track-view';
import { useQuery } from '@tanstack/react-query';
import { Link, createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/truyen/$slug/')({
  component: StoryDetail,
  validateSearch: (s: Record<string, unknown>) => ({
    page: Number(s.page) || 1,
    commentsPage: Number(s.commentsPage) || 1,
  }),
});

const STATUS_LABEL: Record<string, string> = {
  ongoing: 'Đang ra',
  completed: 'Hoàn thành',
  dropped: 'Tạm dừng',
  unknown: '—',
};

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

  // Plan D: fire view increment once per calendar day (anonymous-friendly)
  useTrackStoryView(storyQ.data?.id);

  if (storyQ.isLoading) {
    return <div className="container py-20 text-center text-muted-foreground">Đang tải...</div>;
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

  const items = (chaptersQ.data?.items ?? []).map((c) => ({
    index: Number(c.index),
    title: c.title,
    isCrawled: c.status === 'crawled',
  }));

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border">
        {s.hasCover && (
          <div aria-hidden className="absolute inset-0 -z-10">
            <img
              src={`/api/v1/cover/${s.id}`}
              alt=""
              className="w-full h-full object-cover blur-3xl scale-110 opacity-30"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-bg/60 via-bg/90 to-bg" />
          </div>
        )}
        <div className="container py-10 lg:py-16 grid lg:grid-cols-[240px_1fr] gap-8 items-start">
          {/* Cover */}
          <div className="relative aspect-[3/4] w-full max-w-[240px] rounded-lg overflow-hidden border border-border-strong shadow-elev">
            <StoryCover storyId={s.id} title={s.title} hasCover={s.hasCover} loading="eager" />
          </div>
          {/* Info */}
          <div>
            {s.featured && (
              <p className="text-label text-accent uppercase mb-3 inline-flex items-center gap-1.5">
                <span aria-hidden>★</span> TRUYỆN NỔI BẬT
              </p>
            )}
            <h1 className="text-display-sm lg:text-display-md font-prose font-semibold tracking-tight">
              {s.title}
            </h1>
            <p className="mt-3 text-body text-fg-muted">
              {s.author ?? 'Khuyết danh'} · {s.totalChapters} chương ·{' '}
              {STATUS_LABEL[s.status] ?? s.status}
            </p>
            {/* Plan D: rating stars + view counter */}
            <div className="mt-4 flex flex-wrap items-center gap-4">
              <RatingControl
                storyId={s.id}
                slug={s.slug}
                ratingAvg={s.ratingAvg ?? null}
                ratingCount={s.ratingCount}
              />
              {s.viewCount > 0 && <ViewCount count={s.viewCount} label="lượt xem" />}
            </div>
            {s.genres && s.genres.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {s.genres.map((g) => (
                  <span
                    key={g.slug}
                    className="inline-flex items-center h-7 px-3 rounded-full text-body-sm bg-bg-subtle border border-border"
                  >
                    {g.name}
                  </span>
                ))}
              </div>
            )}
            <p className="mt-6 text-body text-fg-muted line-clamp-4">{s.description}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/truyen/$slug/chuong/$index"
                params={{ slug: s.slug, index: '1' }}
                search={{ commentsPage: 1 }}
                className="inline-flex items-center gap-2 h-11 px-5 rounded-md border border-border-strong hover:bg-bg-subtle text-body font-semibold transition-colors duration-fast"
              >
                Đọc từ đầu
              </Link>
              {/* "Đọc tiếp Chương N" pink CTA — wired by Plan C when reading_progress exists */}
              <BookmarkToggle storyId={s.id} />
            </div>
          </div>
        </div>
      </section>

      {/* Reading insights — shown only when logged in and user has reading progress on this story */}
      <div className="container pt-4">
        <ReadingInsights storyId={s.id} />
      </div>

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

      <RecommendationSection kind="similar" storyId={s.id} />

      <CommentSection targetType="story" targetId={s.id} slug={s.slug} />
    </div>
  );
}
