import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, BookOpen, Sparkles } from 'lucide-react';
import { listStories, type StorySummary } from '@/api/stories';
import { StoryGrid } from '@/components/reader/StoryGrid';

export const Route = createFileRoute('/')({
  component: Landing,
  loader: ({ context }) =>
    context.queryClient.ensureQueryData({
      queryKey: ['stories', { page: 1, limit: 48 }],
      queryFn: () => listStories(1, 48),
    }),
});

function Landing() {
  const { data: stories = [] } = useQuery({
    queryKey: ['stories', { page: 1, limit: 48 }],
    queryFn: () => listStories(1, 48),
  });

  const featured = stories[0];
  const rest = stories.slice(1);

  return (
    <div className="space-y-16 sm:space-y-24 pb-20">
      <EditorialHero featured={featured} totalCount={stories.length} />

      {rest.length > 0 && (
        <section className="container">
          <SectionHeader
            eyebrow="Thư viện"
            title="Mới cập nhật"
            description={`${rest.length} truyện khác đang chờ bạn khám phá.`}
          />
          <StoryGrid stories={rest} />
        </section>
      )}

      <DiscoveryStrip />
    </div>
  );
}

function EditorialHero({ featured, totalCount }: { featured?: StorySummary; totalCount: number }) {
  return (
    <section className="relative overflow-hidden">
      {/* Decorative editorial background */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,hsl(322_84%_60%/0.08),transparent_55%),radial-gradient(ellipse_at_bottom_left,hsl(240_4%_46%/0.05),transparent_50%)]"
      />
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 -z-10 h-px bg-gradient-to-r from-transparent via-border to-transparent"
      />

      <div className="container pt-12 sm:pt-20 lg:pt-28">
        <div className="grid lg:grid-cols-[1.2fr_1fr] gap-10 lg:gap-16 items-center">
          {/* Editorial copy */}
          <div className="space-y-6 max-w-2xl">
            <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.28em] text-muted-foreground font-medium">
              <Sparkles className="h-3.5 w-3.5" />
              Tạp chí truyện chữ Việt
            </div>
            <h1 className="font-heading font-bold leading-[0.95] tracking-tight text-5xl sm:text-6xl lg:text-7xl xl:text-[5.5rem]">
              Đọc truyện chữ,
              <br />
              <span className="italic font-medium text-muted-foreground">
                theo cách của bạn.
              </span>
            </h1>
            <p className="text-base sm:text-lg text-muted-foreground leading-relaxed max-w-prose">
              Tuyển chọn tiểu thuyết tiếng Việt với trải nghiệm đọc tối giản —
              không quảng cáo chen ngang, không pop-up, chỉ có bạn và câu chuyện.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              {featured && (
                <Link
                  to="/truyen/$slug"
                  params={{ slug: featured.slug }}
                  search={{ page: 1 }}
                  className="group inline-flex items-center gap-2 h-11 px-6 rounded-full bg-[hsl(var(--color-cta))] text-white font-medium text-sm shadow-sm hover:shadow-md hover:opacity-95 transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--color-cta))] focus-visible:ring-offset-2"
                >
                  Đọc truyện nổi bật
                  <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                </Link>
              )}
              <a
                href="#thu-vien"
                className="inline-flex items-center gap-2 h-11 px-5 rounded-full border border-border hover:border-foreground/40 hover:bg-muted/60 text-sm font-medium transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <BookOpen className="h-4 w-4" />
                Xem toàn bộ thư viện
              </a>
            </div>
            <div className="flex items-center gap-6 pt-4 text-xs text-muted-foreground">
              <Stat label="Truyện" value={totalCount.toString()} />
              <Divider />
              <Stat label="Cập nhật" value="liên tục" />
              <Divider />
              <Stat label="Miễn phí" value="hoàn toàn" />
            </div>
          </div>

          {/* Featured card */}
          {featured ? <FeaturedCard story={featured} /> : <EmptyFeaturedSlot />}
        </div>
      </div>
    </section>
  );
}

function FeaturedCard({ story }: { story: StorySummary }) {
  return (
    <Link
      to="/truyen/$slug"
      params={{ slug: story.slug }}
      search={{ page: 1 }}
      className="group relative block w-full max-w-md mx-auto cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-2xl"
    >
      <div className="relative aspect-[3/4] rounded-2xl overflow-hidden shadow-[0_30px_60px_-20px_rgba(0,0,0,0.25),0_0_0_1px_rgba(0,0,0,0.05)] transition-transform duration-300 group-hover:-translate-y-1">
        {story.hasCover ? (
          <img
            src={`/api/v1/cover/${story.id}`}
            alt={`Bìa ${story.title}`}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-muted text-muted-foreground text-sm">
            Không có bìa
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/85 via-zinc-950/20 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-6 text-white">
          <p className="text-[11px] uppercase tracking-[0.25em] text-white/70 mb-2 font-medium">
            Truyện nổi bật
          </p>
          <h2 className="font-heading font-semibold text-2xl leading-tight tracking-tight line-clamp-2 mb-1.5">
            {story.title}
          </h2>
          <p className="text-sm text-white/80 mb-3">
            {story.author ?? 'Khuyết danh'} · {story.totalChapters} chương
          </p>
          <div className="inline-flex items-center gap-1.5 text-sm font-medium transition-all duration-200 group-hover:gap-2.5">
            Đọc ngay
            <ArrowRight className="h-3.5 w-3.5" />
          </div>
        </div>
      </div>
    </Link>
  );
}

function EmptyFeaturedSlot() {
  return (
    <div className="relative w-full max-w-md mx-auto aspect-[3/4] rounded-2xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-3 text-center p-8">
      <BookOpen className="h-10 w-10 text-muted-foreground/50" />
      <p className="font-heading text-lg">Chưa có truyện nào</p>
      <p className="text-xs text-muted-foreground max-w-xs">
        Đăng nhập trang quản trị để import truyện đầu tiên từ các nguồn được hỗ trợ.
      </p>
    </div>
  );
}

function SectionHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <div id="thu-vien" className="mb-8 scroll-mt-24">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground font-medium mb-2">
            {eyebrow}
          </p>
          <h2 className="font-heading font-bold text-3xl sm:text-4xl tracking-tight">
            {title}
          </h2>
        </div>
        {description && (
          <p className="text-sm text-muted-foreground max-w-xs">{description}</p>
        )}
      </div>
      <div className="mt-6 h-px w-full bg-gradient-to-r from-border via-border to-transparent" />
    </div>
  );
}

function DiscoveryStrip() {
  const themes = [
    'Đam mỹ',
    'Xuyên không',
    'Tiên hiệp',
    'Kiếm hiệp',
    'Ngôn tình',
    'Huyền huyễn',
    'Trọng sinh',
    'Sủng',
  ];
  return (
    <section className="container">
      <div className="rounded-2xl border border-border bg-gradient-to-br from-muted/40 to-background p-8 sm:p-12">
        <p className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground font-medium mb-3">
          Khám phá theo thể loại
        </p>
        <h3 className="font-heading font-semibold text-2xl sm:text-3xl tracking-tight mb-6 max-w-xl">
          Tìm truyện phù hợp với tâm trạng hôm nay.
        </h3>
        <div className="flex flex-wrap gap-2">
          {themes.map((t) => (
            <span
              key={t}
              className="inline-flex items-center h-9 px-4 rounded-full text-sm bg-background border border-border hover:border-foreground/40 hover:bg-muted/60 transition-colors duration-200 cursor-default text-foreground/80"
            >
              {t}
            </span>
          ))}
        </div>
        <p className="mt-5 text-xs text-muted-foreground">
          Bộ lọc thể loại sẽ ra mắt trong bản cập nhật tiếp theo.
        </p>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-heading font-semibold text-base text-foreground">{value}</div>
      <div className="text-[10px] uppercase tracking-[0.2em] mt-0.5">{label}</div>
    </div>
  );
}

function Divider() {
  return <span aria-hidden className="h-8 w-px bg-border" />;
}
