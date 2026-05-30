import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, BookOpen } from 'lucide-react';
import { meApi } from '@/api/me';
import { listStories } from '@/api/stories';
import { useAuthStore } from '@/stores/auth-store';

export const Route = createFileRoute('/')({ component: HomePage });

function HomePage() {
  const user = useAuthStore((s) => s.user);
  const storiesQ = useQuery({
    queryKey: ['stories', { page: 1, limit: 12 }],
    queryFn: () => listStories(1, 12),
  });

  return (
    <div className="container py-8 lg:py-12 space-y-12 lg:space-y-16">
      {user ? <LoggedInHero /> : <AnonHero />}
      <UpdatedSection stories={storiesQ.data ?? []} isLoading={storiesQ.isLoading} />
      <GenreSection />
    </div>
  );
}

function AnonHero() {
  return (
    <section className="relative overflow-hidden rounded-xl border border-border bg-bg-elevated p-8 lg:p-16">
      <div aria-hidden className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-accent/20 blur-3xl" />
      <p className="text-label text-fg-muted uppercase mb-3">TẠP CHÍ TRUYỆN CHỮ VIỆT</p>
      <h1 className="text-display-sm sm:text-display-md lg:text-display-lg">
        Đọc truyện chữ.<br />
        <span className="bg-accent-gradient bg-clip-text text-transparent">Như nó nên là.</span>
      </h1>
      <p className="mt-6 max-w-xl text-body lg:text-base text-fg-muted">
        Tuyển chọn tiểu thuyết tiếng Việt với trải nghiệm đọc tối giản — không quảng cáo chen ngang, không pop-up.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          to="/tim-kiem"
          search={{ q: '', page: 1 }}
          className="inline-flex items-center gap-2 h-11 px-5 rounded-md bg-accent-gradient text-white text-body font-semibold shadow-glow-pink-soft hover:shadow-glow-pink transition-shadow duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
        >
          Khám phá truyện <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
        <Link
          to="/dang-nhap"
          search={{ redirect: '/tu-sach' }}
          className="inline-flex items-center h-11 px-5 rounded-md border border-border-strong hover:bg-bg-subtle text-body font-semibold transition-colors duration-fast"
        >
          Đăng nhập
        </Link>
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
  const cr = q.data;
  if (q.isLoading) {
    return (
      <section className="relative overflow-hidden rounded-xl border border-border bg-bg-elevated p-8 lg:p-12">
        <div className="h-3 w-20 bg-bg-subtle rounded mb-3 animate-pulse" />
        <div className="h-10 w-3/4 bg-bg-subtle rounded mb-3 animate-pulse" />
        <div className="h-4 w-1/2 bg-bg-subtle rounded animate-pulse" />
      </section>
    );
  }
  if (!cr) return <AnonHero />;
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
              className="inline-flex items-center gap-2 h-11 px-5 rounded-md bg-accent-gradient text-white text-body font-semibold shadow-glow-pink-soft hover:shadow-glow-pink transition-shadow duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
            >
              Tiếp tục đọc <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link
              to="/truyen/$slug"
              params={{ slug: cr.storySlug }}
              search={{ page: 1 }}
              className="inline-flex items-center h-11 px-5 rounded-md border border-border-strong hover:bg-bg-subtle text-body font-semibold transition-colors duration-fast"
            >
              Xem truyện
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function UpdatedSection({ stories, isLoading }: { stories: any[]; isLoading: boolean }) {
  return (
    <section>
      <div className="flex items-end justify-between mb-6">
        <div>
          <p className="text-label text-fg-muted uppercase mb-2">THƯ VIỆN</p>
          <h2 className="text-heading-lg">Mới cập nhật</h2>
        </div>
        <Link to="/tim-kiem" search={{ q: '', page: 1 }} className="text-body-sm text-fg-muted hover:text-fg transition-colors duration-fast">
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
          {stories?.map((s: any) => <StoryCard key={s.id} story={s} />)}
        </div>
      )}
    </section>
  );
}

function StoryCard({ story }: { story: any }) {
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
    </Link>
  );
}

function GenreSection() {
  const genres = ['Đam mỹ', 'Xuyên không', 'Tiên hiệp', 'Kiếm hiệp', 'Ngôn tình', 'Huyền huyễn', 'Trọng sinh', 'Sủng'];
  return (
    <section>
      <div className="mb-6">
        <p className="text-label text-fg-muted uppercase mb-2">KHÁM PHÁ</p>
        <h2 className="text-heading-lg">Theo thể loại</h2>
      </div>
      <div className="flex flex-wrap gap-2">
        {genres.map((g) => (
          <Link
            key={g}
            to="/tim-kiem"
            search={{ q: g, page: 1 }}
            className="inline-flex items-center h-9 px-4 rounded-full border border-border hover:border-border-strong hover:bg-bg-subtle text-body-sm transition-colors duration-fast"
          >
            {g}
          </Link>
        ))}
      </div>
    </section>
  );
}
