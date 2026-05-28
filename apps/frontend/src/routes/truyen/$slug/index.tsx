import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { getStoryBySlug, listChapters } from '@/api/stories';
import { ChapterList } from '@/components/reader/ChapterList';
import { Badge } from '@/components/ui/badge';

export const Route = createFileRoute('/truyen/$slug/')({
  component: StoryDetail,
  validateSearch: (s: Record<string, unknown>) => ({ page: Number(s.page) || 1 }),
});

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

  if (storyQ.isLoading) return <div className="container py-8">Đang tải...</div>;
  if (!storyQ.data) return <div className="container py-8">Không tìm thấy.</div>;

  const s = storyQ.data;
  const items = (chaptersQ.data?.items ?? []).map((c) => ({
    index: Number(c.index),
    title: c.title,
    isCrawled: c.status === 'crawled',
  }));

  return (
    <div className="container py-8 space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-6">
        <div className="aspect-[3/4] bg-muted overflow-hidden rounded-lg shadow-md">
          <img
            src={`/api/v1/cover/${s.id}`}
            alt={`Bìa ${s.title}`}
            className="w-full h-full object-cover"
          />
        </div>
        <div className="space-y-3">
          <h1 className="text-3xl font-bold font-heading">{s.title}</h1>
          <p className="text-muted-foreground">Tác giả: {s.author ?? 'Khuyết danh'}</p>
          <div className="flex gap-2 flex-wrap items-center">
            <Badge
              variant={s.status === 'completed' ? 'default' : 'secondary'}
              className="transition-colors duration-150"
            >
              {s.status === 'completed'
                ? 'Hoàn thành'
                : s.status === 'ongoing'
                  ? 'Đang ra'
                  : s.status}
            </Badge>
            <span className="text-sm text-muted-foreground">{s.totalChapters} chương</span>
          </div>
          {s.genres.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {s.genres.map((g) => (
                <span
                  key={g.slug}
                  className="text-xs px-2 py-0.5 rounded bg-muted transition-colors duration-150"
                >
                  {g.name}
                </span>
              ))}
            </div>
          )}
          <div className="pt-2">
            <Link
              to="/truyen/$slug/chuong/$index"
              params={{ slug: s.slug, index: '1' }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 transition-all duration-200 cursor-pointer focus-visible:ring-2 focus-visible:ring-primary"
            >
              Đọc từ đầu
            </Link>
          </div>
        </div>
      </div>

      {s.description && (
        <section>
          <h2 className="text-lg font-semibold mb-2">Giới thiệu</h2>
          <p className="whitespace-pre-line text-sm leading-relaxed">{s.description}</p>
        </section>
      )}

      <section>
        <h2 className="text-lg font-semibold mb-3">Danh sách chương</h2>
        <ChapterList
          slug={s.slug}
          chapters={items}
          currentPage={page}
          totalPages={chaptersQ.data?.totalPages ?? 1}
        />
      </section>
    </div>
  );
}
