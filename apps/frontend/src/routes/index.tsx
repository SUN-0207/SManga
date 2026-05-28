import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { listStories } from '@/api/stories';
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

  return (
    <div className="container py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-heading">Mới cập nhật</h1>
        <p className="text-muted-foreground text-sm">{stories.length} truyện</p>
      </div>
      <StoryGrid stories={stories} />
    </div>
  );
}
