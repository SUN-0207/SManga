import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Heart } from 'lucide-react';
import { bookmarksApi } from '@/api/bookmarks';
import { useAuthStore } from '@/stores/auth-store';

export function BookmarkToggle({ storyId }: { storyId: string }) {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['bookmark', storyId],
    queryFn: () => bookmarksApi.has(storyId),
    enabled: !!user,
  });

  const active = data?.bookmarked ?? false;

  const toggle = useMutation({
    mutationFn: async () => {
      if (active) await bookmarksApi.remove(storyId);
      else await bookmarksApi.add(storyId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bookmark', storyId] });
      qc.invalidateQueries({ queryKey: ['bookmarks'] });
    },
  });

  if (!user) return null;

  const activeClass =
    "inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-1.5 text-body-sm font-medium text-white shadow-glow-pink-soft transition-opacity duration-fast hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg";

  const inactiveClass =
    "inline-flex items-center gap-1.5 rounded-full border border-border bg-bg px-4 py-1.5 text-body-sm font-medium text-fg transition-colors duration-fast hover:border-border-strong hover:bg-bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg";

  return (
    <button
      type="button"
      onClick={() => toggle.mutate()}
      disabled={isLoading || toggle.isPending}
      aria-pressed={active}
      className={active ? activeClass : inactiveClass}
    >
      <Heart
        className="h-4 w-4 transition-transform duration-200 group-hover:scale-110"
        fill={active ? 'currentColor' : 'none'}
      />
      {active ? 'Đã lưu' : 'Lưu truyện'}
    </button>
  );
}
