import { getStoryBySlug, listAllChapters } from '@/api/stories';
import { CommentSection } from '@/components/comments/CommentSection';
import { RatingControl } from '@/components/engagement/RatingControl';
import { ViewCount } from '@/components/engagement/ViewCount';
import { BookmarkToggle } from '@/components/reader/BookmarkToggle';
import { ChapterBrowser } from '@/components/reader/ChapterBrowser';
import { RecommendationSection } from '@/components/recommendations/RecommendationSection';
import { SEO } from '@/components/seo/SEO';
import {
  buildBookSchema,
  buildBreadcrumbSchema,
  stripAndTruncate,
} from '@/components/seo/builders';
import { SimilarStoriesRail } from '@/components/story/SimilarStoriesRail';
import { StoryCover } from '@/components/ui/StoryCover';
import { readingProgressApi } from '@/api/reading-progress';
import { useTrackStoryView } from '@/hooks/use-track-view';
import { useAuthStore } from '@/stores/auth-store';
import { useQuery } from '@tanstack/react-query';
import { Link, createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/truyen/$slug/')({
  component: StoryDetail,
  validateSearch: (s: Record<string, unknown>) => ({
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

  const storyQ = useQuery({
    queryKey: ['story', slug],
    queryFn: () => getStoryBySlug(slug),
  });

  const user = useAuthStore((st) => st.user);

  const chaptersQ = useQuery({
    queryKey: ['chapters-all', slug],
    queryFn: () => listAllChapters(slug),
  });

  const progressQ = useQuery({
    queryKey: ['reading-progress'],
    queryFn: () => readingProgressApi.list(),
    enabled: !!user,
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

  const items = (chaptersQ.data ?? []).map((c) => ({
    index: Number(c.index),
    title: c.title,
    isCrawled: c.status === 'crawled',
  }));

  const progressRow = progressQ.data?.find((r) => r.storyId === s.id);
  const readUpToIndex = progressRow ? Number(progressRow.chapterIndex) : null;

  return (
    <div>
      <SEO
        title={`${s.title} - Đọc truyện ${s.genres?.[0]?.name ?? 'online'} full | SManga`}
        description={
          stripAndTruncate(s.description, 160) ||
          `Đọc ${s.title} của ${s.author ?? 'Khuyết danh'} — ${s.totalChapters} chương, cập nhật ${new Date(s.updatedAt).toISOString().slice(0, 10)}. Đọc truyện chữ Việt online miễn phí trên SManga.`
        }
        canonical={`/truyen/${s.slug}`}
        ogType="book"
        ogImage={s.hasCover ? `/api/v1/cover/${s.id}` : undefined}
        jsonLd={[
          buildBookSchema(s),
          buildBreadcrumbSchema([{ name: 'Trang chủ', url: '/' }, { name: s.title }]),
        ]}
      />
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
                className="inline-flex items-center gap-2 h-11 px-5 rounded-md bg-accent text-white font-semibold shadow-glow-pink-soft transition-opacity duration-fast hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg cursor-pointer"
              >
                Đọc từ đầu
              </Link>
              {s.latestChapterIndex != null && (
                <Link
                  to="/truyen/$slug/chuong/$index"
                  params={{ slug: s.slug, index: String(s.latestChapterIndex) }}
                  search={{ commentsPage: 1 }}
                  className="inline-flex items-center gap-2 h-11 px-5 rounded-md border border-border-strong hover:bg-bg-subtle text-body font-semibold transition-colors duration-fast cursor-pointer"
                >
                  Đọc chương mới nhất
                </Link>
              )}
              {/* "Đọc tiếp Chương N" pink CTA — wired by Plan C when reading_progress exists */}
              <BookmarkToggle storyId={s.id} />
            </div>
          </div>
        </div>
      </section>

      {/* Chapter list */}
      <section id="muc-luc" className="container pb-20 scroll-mt-24">
        <div className="max-w-5xl mx-auto">
          <div className="mb-6">
            <p className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground font-medium mb-2">
              Mục lục
            </p>
            <h2 className="font-heading font-bold text-2xl sm:text-3xl tracking-tight">
              Danh sách chương
            </h2>
          </div>
          <div className="h-px w-full bg-gradient-to-r from-border via-border to-transparent mb-6" />
          <ChapterBrowser
            slug={s.slug}
            chapters={items}
            readUpToIndex={readUpToIndex}
            isAuthenticated={!!user}
          />
        </div>
      </section>

      {s.author && s.author !== 'Khuyết danh' && (
        <SimilarStoriesRail title="Cùng tác giả" by="author" value={s.author} excludeId={s.id} />
      )}
      {s.genres?.[0]?.slug && (
        <SimilarStoriesRail
          title="Cùng thể loại"
          by="genre"
          value={s.genres[0].slug}
          excludeId={s.id}
        />
      )}
      <RecommendationSection kind="similar" storyId={s.id} />

      <CommentSection targetType="story" targetId={s.id} slug={s.slug} />
    </div>
  );
}
