import { useEffect, useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, BookOpen } from 'lucide-react';
import { meApi } from '@/api/me';
import { listStories, type StorySummary } from '@/api/stories';
import { listGenres } from '@/api/genres';
import { useAuthStore } from '@/stores/auth-store';
import { RatingStars } from '@/components/engagement/RatingStars';
import { ViewCount }   from '@/components/engagement/ViewCount';
import { HomeRankingsSection } from '@/components/rankings/HomeRankingsSection';

export const Route = createFileRoute('/')({ component: HomePage });

const SLIDE_COUNT = 4;
const ROTATE_MS = 5500;

function HomePage() {
  const user = useAuthStore((s) => s.user);
  const storiesQ = useQuery({
    queryKey: ['stories', { page: 1, limit: 12 }],
    queryFn: () => listStories(1, 12),
  });

  return (
    <div className="container py-8 lg:py-12 space-y-12 lg:space-y-16">
      <FeaturedSlider stories={storiesQ.data ?? []} isLoading={storiesQ.isLoading} />
      {user && <LoggedInHero />}
      <HomeRankingsSection />
      <UpdatedSection stories={storiesQ.data ?? []} isLoading={storiesQ.isLoading} />
      <GenreSection />
    </div>
  );
}

function FeaturedSlider({
  stories,
  isLoading,
}: {
  stories: StorySummary[];
  isLoading: boolean;
}) {
  const slides = stories.slice(0, SLIDE_COUNT);
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (slides.length <= 1) return;
    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) return;
    const t = setInterval(() => {
      setActive((i) => (i + 1) % slides.length);
    }, ROTATE_MS);
    return () => clearInterval(t);
  }, [slides.length]);

  if (isLoading) return <SliderSkeleton />;
  if (slides.length === 0) return null;

  return (
    <section className="relative overflow-hidden rounded-xl border border-border bg-bg-elevated">
      <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_1fr]">
        <div className="relative p-8 sm:p-12 lg:p-16">
          <div
            aria-hidden
            className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-accent/15 blur-3xl pointer-events-none"
          />
          <p className="relative text-label text-fg-muted uppercase mb-3 inline-flex items-center gap-1.5">
            <span aria-hidden className="text-accent">✦</span>
            TẠP CHÍ TRUYỆN CHỮ VIỆT
          </p>
          <h1 className="relative text-display-sm sm:text-display-md lg:text-display-lg font-prose font-bold">
            Đọc truyện chữ,
            <br />
            <span className="italic font-normal text-fg-muted">theo cách của bạn.</span>
          </h1>
          <p className="relative mt-6 max-w-md text-body text-fg-muted">
            Tuyển chọn tiểu thuyết tiếng Việt với trải nghiệm đọc tối giản —
            không quảng cáo chen ngang, không pop-up, chỉ có bạn và câu chuyện.
          </p>
          <div className="relative mt-8 flex flex-wrap gap-3">
            <Link
              to="/kham-pha"
              search={{ q: '', page: 1, genre: undefined }}
              className="inline-flex items-center gap-2 h-11 px-5 rounded-full bg-accent-gradient text-white text-body font-semibold shadow-glow-pink-soft hover:shadow-glow-pink transition-shadow duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-elevated"
            >
              Đọc truyện nổi bật <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link
              to="/kham-pha"
              search={{ q: '', page: 1, genre: undefined }}
              className="inline-flex items-center gap-2 h-11 px-5 rounded-full border border-border-strong hover:bg-bg-subtle text-body font-semibold transition-colors duration-fast cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-elevated"
            >
              <BookOpen className="h-4 w-4" aria-hidden /> Xem toàn bộ thư viện
            </Link>
          </div>
          <p className="relative mt-10 text-label text-fg-subtle uppercase">
            {stories.length}+ TRUYỆN · CẬP NHẬT LIÊN TỤC · MIỄN PHÍ HOÀN TOÀN
          </p>
        </div>

        <div className="relative min-h-[420px] lg:min-h-[540px] overflow-hidden">
          <div
            aria-hidden
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'linear-gradient(135deg, rgba(236,72,153,0.18), rgba(244,114,182,0.04))',
            }}
          />
          {slides.map((story, i) => (
            <Link
              key={story.id}
              to="/truyen/$slug"
              params={{ slug: story.slug }}
              search={{ page: 1 }}
              aria-hidden={i !== active}
              tabIndex={i === active ? 0 : -1}
              className={`absolute inset-0 flex items-end p-8 sm:p-10 lg:p-12 group transition-opacity duration-500 ease-out cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset ${
                i === active ? 'opacity-100' : 'opacity-0 pointer-events-none'
              }`}
            >
              {story.hasCover && (
                <img
                  src={`/api/v1/cover/${story.id}`}
                  alt=""
                  loading={i === 0 ? 'eager' : 'lazy'}
                  className="absolute right-6 sm:right-10 top-8 sm:top-12 h-[52%] sm:h-[58%] w-auto aspect-[3/4] object-cover rounded-md shadow-elev transition-transform duration-300 ease-out group-hover:scale-[1.02]"
                />
              )}
              <div className="relative max-w-[58%]">
                <p className="text-label text-fg-muted uppercase tracking-[0.18em]">
                  TRUYỆN NỔI BẬT
                </p>
                <h3 className="mt-2 text-heading-lg lg:text-display-sm font-prose font-bold line-clamp-2">
                  {story.title}
                </h3>
                <p className="mt-2 text-body-sm text-fg-muted truncate">
                  {story.author ?? 'Khuyết danh'} · {story.totalChapters.toLocaleString('vi-VN')} chương
                </p>
                <span className="mt-4 inline-flex items-center gap-1.5 text-body font-semibold text-fg group-hover:gap-2.5 transition-all duration-fast">
                  Đọc ngay
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </span>
              </div>
            </Link>
          ))}

          {slides.length > 1 && (
            <div
              className="absolute bottom-5 right-6 sm:right-10 z-10 flex items-center gap-1.5"
              role="tablist"
              aria-label="Chọn truyện nổi bật"
            >
              {slides.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={i === active}
                  aria-label={`Truyện ${i + 1}: ${s.title}`}
                  onClick={() => setActive(i)}
                  className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-elevated ${
                    i === active ? 'w-6 bg-accent' : 'w-1.5 bg-fg-muted/40 hover:bg-fg-muted/70'
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function SliderSkeleton() {
  return (
    <section className="relative overflow-hidden rounded-xl border border-border bg-bg-elevated">
      <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_1fr]">
        <div className="p-8 sm:p-12 lg:p-16 space-y-4">
          <div className="h-3 w-40 bg-bg-subtle rounded animate-pulse" />
          <div className="h-12 w-3/4 bg-bg-subtle rounded animate-pulse" />
          <div className="h-12 w-2/3 bg-bg-subtle rounded animate-pulse" />
          <div className="h-4 w-full max-w-md bg-bg-subtle rounded animate-pulse" />
          <div className="flex gap-3 pt-4">
            <div className="h-11 w-44 bg-bg-subtle rounded-full animate-pulse" />
            <div className="h-11 w-52 bg-bg-subtle rounded-full animate-pulse" />
          </div>
        </div>
        <div className="min-h-[420px] lg:min-h-[540px] bg-accent/5" />
      </div>
    </section>
  );
}

function LoggedInHero() {
  const q = useQuery({
    queryKey: ['me', 'continue-reading'],
    queryFn: () => meApi.continueReading(),
    staleTime: 60_000,
  });
  if (q.isLoading) {
    return (
      <section className="relative overflow-hidden rounded-xl border border-border bg-bg-elevated p-8 lg:p-12">
        <div className="h-3 w-20 bg-bg-subtle rounded mb-3 animate-pulse" />
        <div className="h-10 w-3/4 bg-bg-subtle rounded mb-3 animate-pulse" />
        <div className="h-4 w-1/2 bg-bg-subtle rounded animate-pulse" />
      </section>
    );
  }
  const cr = q.data;
  if (!cr) return null;
  const chapter = Math.floor(Number(cr.chapterIndex));
  return (
    <section className="relative overflow-hidden rounded-xl border border-accent/20 bg-bg-elevated p-8 lg:p-12">
      <div aria-hidden className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-accent/20 blur-3xl" />
      <div className="relative flex flex-col sm:flex-row gap-6 sm:items-center">
        {cr.hasCover && (
          <img
            src={`/api/v1/cover/${cr.storyId}`}
            alt=""
            loading="lazy"
            className="hidden sm:block h-32 w-24 rounded-md object-cover border border-border flex-shrink-0"
          />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-label text-accent uppercase mb-2 flex items-center gap-1.5">
            <BookOpen className="h-3.5 w-3.5" aria-hidden />
            ĐỌC TIẾP · CHƯƠNG {chapter} / {cr.totalChapters}
          </p>
          <h1 className="text-display-sm sm:text-display-md font-prose font-semibold truncate">
            {cr.storyTitle}
          </h1>
          <p className="mt-3 text-body text-fg-muted">
            Bạn đang đọc dở chương {chapter}. Tiếp tục ngay nào.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to="/truyen/$slug/chuong/$index"
              params={{ slug: cr.storySlug, index: String(chapter) }}
              className="inline-flex items-center gap-2 h-11 px-5 rounded-md bg-accent-gradient text-white text-body font-semibold shadow-glow-pink-soft hover:shadow-glow-pink transition-shadow duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
            >
              Tiếp tục đọc <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link
              to="/truyen/$slug"
              params={{ slug: cr.storySlug }}
              search={{ page: 1 }}
              className="inline-flex items-center h-11 px-5 rounded-md border border-border-strong hover:bg-bg-subtle text-body font-semibold transition-colors duration-fast cursor-pointer"
            >
              Xem truyện
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function UpdatedSection({ stories, isLoading }: { stories: StorySummary[]; isLoading: boolean }) {
  return (
    <section>
      <div className="flex items-end justify-between mb-6">
        <div>
          <p className="text-label text-fg-muted uppercase mb-2">THƯ VIỆN</p>
          <h2 className="text-heading-lg">Mới cập nhật</h2>
        </div>
        <Link
          to="/kham-pha"
          search={{ q: '', page: 1, genre: undefined }}
          className="text-body-sm text-fg-muted hover:text-fg transition-colors duration-fast"
        >
          Xem tất cả →
        </Link>
      </div>
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="aspect-[3/4] rounded-md bg-bg-subtle animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {stories.map((s) => (
            <HomeStoryCard key={s.id} story={s} />
          ))}
        </div>
      )}
    </section>
  );
}

function HomeStoryCard({ story }: { story: StorySummary }) {
  return (
    <Link
      to="/truyen/$slug"
      params={{ slug: story.slug }}
      search={{ page: 1 }}
      className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-md"
    >
      <div className="relative aspect-[3/4] overflow-hidden rounded-md border border-border bg-bg-subtle">
        {story.hasCover && (
          <img
            src={`/api/v1/cover/${story.id}`}
            alt=""
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
          />
        )}
      </div>
      <h3 className="mt-3 text-heading-md line-clamp-2">{story.title}</h3>
      <p className="mt-1 text-body-sm text-fg-muted truncate">{story.author ?? 'Khuyết danh'}</p>
      {/* Plan D: micro engagement — render only when at least one signal is non-zero */}
      {(story.ratingCount > 0 || story.viewCount > 0) && (
        <div className="mt-1 flex items-center gap-2 flex-wrap">
          {story.ratingCount > 0 && (
            <RatingStars value={story.ratingAvg} size="sm" />
          )}
          {story.viewCount > 0 && (
            <ViewCount count={story.viewCount} />
          )}
        </div>
      )}
    </Link>
  );
}

function GenreSection() {
  const genresQ = useQuery({
    queryKey: ['genres'],
    queryFn: listGenres,
    staleTime: 30 * 60_000,
  });
  // Top 12 most-used genres on home — full list lives on /kham-pha.
  const top = (genresQ.data ?? []).filter((g) => g.storyCount > 0).slice(0, 12);
  if (top.length === 0) return null;
  return (
    <section>
      <div className="mb-6">
        <p className="text-label text-fg-muted uppercase mb-2">KHÁM PHÁ</p>
        <h2 className="text-heading-lg">Theo thể loại</h2>
      </div>
      <div className="flex flex-wrap gap-2">
        {top.map((g) => (
          <Link
            key={g.slug}
            to="/kham-pha"
            search={{ q: '', page: 1, genre: g.slug }}
            title={`${g.name} · ${g.storyCount} truyện`}
            className="inline-flex items-center h-9 px-4 rounded-full border border-border hover:border-border-strong hover:bg-bg-subtle text-body-sm transition-colors duration-fast cursor-pointer"
          >
            {g.name}
          </Link>
        ))}
      </div>
    </section>
  );
}
