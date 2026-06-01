import { useEffect, useMemo } from 'react';
import { MessageCircle } from 'lucide-react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { listComments } from '@/api/comments';
import type { CommentTree as CommentTreeType } from '@/api/comments';
import { useAuthStore } from '@/stores/auth-store';
import { CommentTree } from './CommentTree';
import { CommentForm } from './CommentForm';
import { Pagination } from '@/components/ui/Pagination';
import { EmptyState } from '@/components/ui/EmptyState';

interface Props {
  targetType: 'story' | 'chapter';
  targetId: string;
  slug: string;
  chapterIndex?: string;
}

/** Flatten all users from nested tree for @mention suggestions */
function collectParticipants(nodes: CommentTreeType[]): { id: string; name: string }[] {
  const map = new Map<string, string>();
  function walk(list: CommentTreeType[]) {
    for (const c of list) {
      if (c.user.name) map.set(c.user.id, c.user.name);
      if (c.replies.length) walk(c.replies);
    }
  }
  walk(nodes);
  return [...map.entries()].map(([id, name]) => ({ id, name }));
}

export function CommentSection({ targetType, targetId, slug: _slug, chapterIndex: _chapterIndex }: Props) {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  // Read commentsPage from URL — TanStack Router search params
  // Pages may not have commentsPage in their validateSearch yet; use a safe fallback.
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const page = Math.max(1, Number(search.commentsPage) || 1);
  const navigate = useNavigate();

  const queryKey = ['comments', targetType, targetId, page];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => listComments({ targetType, targetId, page, limit: 20 }),
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['comments', targetType, targetId] });
  }

  const participants = useMemo(() => collectParticipants(data?.items ?? []), [data?.items]);

  const totalPages = Math.ceil((data?.total ?? 0) / 20);

  // Anchor scroll: after data loads, check for #comment-{id} in URL hash
  useEffect(() => {
    if (!data) return;
    const hash = window.location.hash;
    const match = hash.match(/^#comment-(.+)$/);
    if (!match) return;
    const el = document.getElementById(`comment-${match[1]}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [data]);

  return (
    <section className="container max-w-3xl mx-auto py-12">
      <h2 className="font-sans font-bold text-heading-lg tracking-tight mb-6">
        Bình luận{data?.total != null && data.total > 0 ? ` (${data.total})` : ''}
      </h2>

      {/* Top-level comment form */}
      {user ? (
        <div className="mb-8">
          <CommentForm
            targetType={targetType}
            targetId={targetId}
            participants={participants}
            onSuccess={invalidate}
          />
        </div>
      ) : (
        <p className="mb-8 text-body-sm text-fg-muted">
          {/* Use plain <a> with encoded redirect param — avoids TanStack Router search schema constraints */}
          <a
            href={`/dang-nhap?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`}
            className="text-accent underline underline-offset-2"
          >
            Đăng nhập
          </a>{' '}
          để bình luận.
        </p>
      )}

      {/* Comment list */}
      {isLoading ? (
        <div className="space-y-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-lg bg-bg-subtle animate-pulse" />
          ))}
        </div>
      ) : data?.items.length === 0 ? (
        <EmptyState
          illustration={<MessageCircle className="h-12 w-12 text-fg-subtle" />}
          title="Chưa có bình luận"
          description="Hãy là người đầu tiên bình luận!"
        />
      ) : (
        <div className="space-y-6">
          {(data?.items ?? []).map((c) => (
            <CommentTree
              key={c.id}
              comment={c}
              participants={participants}
              onMutated={invalidate}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-8">
          <Pagination
            page={page}
            totalPages={totalPages}
            isLoading={isLoading}
            onChange={(p) => {
              // Build URL with commentsPage param without disturbing existing search params
              const url = new URL(window.location.href);
              url.searchParams.set('commentsPage', String(p));
              void navigate({ to: url.pathname, search: Object.fromEntries(url.searchParams) as Record<string, string> });
            }}
          />
        </div>
      )}
    </section>
  );
}
