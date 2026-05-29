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

  const baseClass =
    'group inline-flex items-center gap-2 h-11 px-5 rounded-full text-sm font-medium transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed';
  const activeClass =
    'bg-[hsl(var(--color-cta))] text-white border border-transparent hover:opacity-95 focus-visible:ring-[hsl(var(--color-cta))]';
  const inactiveClass =
    'border border-border hover:border-foreground/40 hover:bg-muted/60 focus-visible:ring-primary';

  return (
    <button
      type="button"
      onClick={() => toggle.mutate()}
      disabled={isLoading || toggle.isPending}
      aria-pressed={active}
      className={`${baseClass} ${active ? activeClass : inactiveClass}`}
    >
      <Heart
        className="h-4 w-4 transition-transform duration-200 group-hover:scale-110"
        fill={active ? 'currentColor' : 'none'}
      />
      {active ? 'Đã lưu' : 'Lưu truyện'}
    </button>
  );
}
