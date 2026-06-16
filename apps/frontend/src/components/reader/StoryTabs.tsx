import { listComments } from '@/api/comments';
import { CommentSection } from '@/components/comments/CommentSection';
import { ChapterBrowser } from '@/components/reader/ChapterBrowser';
import type { ChapterListItem } from '@/lib/chapter-filter';
import { useQuery } from '@tanstack/react-query';
import { useSearch } from '@tanstack/react-router';
import { useState } from 'react';

type Tab = 'chapters' | 'comments';

export interface StoryTabsProps {
  slug: string;
  storyId: string;
  chapters: ChapterListItem[];
  readUpToIndex: number | null;
  isAuthenticated: boolean;
}

const tabBase =
  'relative -mb-px px-1 pb-3 text-body font-semibold transition-colors duration-fast cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-sm';

/**
 * Story-detail body: tabs the chapter list (ChapterBrowser) and comments
 * (CommentSection) so comments are discoverable instead of stranded at the
 * page bottom. Both panels stay mounted (inactive one hidden) to preserve
 * ChapterBrowser's search/sort state across switches.
 */
export function StoryTabs({
  slug,
  storyId,
  chapters,
  readUpToIndex,
  isAuthenticated,
}: StoryTabsProps) {
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const page = Math.max(1, Number(search.commentsPage) || 1);

  // Smart initial tab: open Comments when deep-linked to a comment.
  const [tab, setTab] = useState<Tab>(() => {
    const deepLinked =
      page > 1 || (typeof window !== 'undefined' && window.location.hash.startsWith('#comment-'));
    return deepLinked ? 'comments' : 'chapters';
  });

  // Same key/params as CommentSection → React Query dedupes to one request.
  const commentsQ = useQuery({
    queryKey: ['comments', 'story', storyId, page],
    queryFn: () => listComments({ targetType: 'story', targetId: storyId, page, limit: 20 }),
  });
  const commentCount = commentsQ.data?.total ?? null;

  return (
    <div className="space-y-6">
      <div
        role="tablist"
        aria-label="Nội dung truyện"
        className="flex items-center gap-6 border-b border-border"
      >
        <button
          type="button"
          role="tab"
          id="tab-chapters"
          aria-selected={tab === 'chapters'}
          aria-controls="panel-chapters"
          onClick={() => setTab('chapters')}
          className={`${tabBase} ${tab === 'chapters' ? 'text-fg' : 'text-fg-muted hover:text-fg'}`}
        >
          Danh sách chương
          {tab === 'chapters' && (
            <span
              aria-hidden
              className="absolute -bottom-px left-0 right-0 h-0.5 bg-accent-gradient rounded-full"
            />
          )}
        </button>
        <button
          type="button"
          role="tab"
          id="tab-comments"
          aria-selected={tab === 'comments'}
          aria-controls="panel-comments"
          onClick={() => setTab('comments')}
          className={`${tabBase} ${tab === 'comments' ? 'text-fg' : 'text-fg-muted hover:text-fg'}`}
        >
          Bình luận{commentCount != null && commentCount > 0 ? ` (${commentCount})` : ''}
          {tab === 'comments' && (
            <span
              aria-hidden
              className="absolute -bottom-px left-0 right-0 h-0.5 bg-accent-gradient rounded-full"
            />
          )}
        </button>
      </div>

      <div
        role="tabpanel"
        id="panel-chapters"
        aria-labelledby="tab-chapters"
        hidden={tab !== 'chapters'}
      >
        <ChapterBrowser
          slug={slug}
          chapters={chapters}
          readUpToIndex={readUpToIndex}
          isAuthenticated={isAuthenticated}
        />
      </div>

      <div
        role="tabpanel"
        id="panel-comments"
        aria-labelledby="tab-comments"
        hidden={tab !== 'comments'}
      >
        <CommentSection targetType="story" targetId={storyId} slug={slug} hideHeading />
      </div>
    </div>
  );
}
