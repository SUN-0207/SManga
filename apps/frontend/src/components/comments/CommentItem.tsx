import { useEffect, useRef, useState } from 'react';
import { useRouterState } from '@tanstack/react-router';
import { Heart, MessageCircle, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { deleteComment, reactComment } from '@/api/comments';
import type { CommentTree } from '@/api/comments';
import { formatRelativeTime } from '@/lib/format';
import { CommentForm } from './CommentForm';
import type { Participant } from '@/hooks/use-mention-autocomplete';

const EDIT_WINDOW_MS = 5 * 60 * 1000;

interface Props {
  comment: CommentTree;
  participants: Participant[];
  onMutated: () => void;
}

export function CommentItem({ comment: c, participants, onMutated }: Props) {
  const user = useAuthStore((s) => s.user);
  // s.location.href does NOT exist on TanStack Router's ParsedLocation — use pathname + searchStr
  const path = useRouterState({ select: (s) => s.location.pathname + (s.location.searchStr ?? '') });
  const [replyOpen, setReplyOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editExpired, setEditExpired] = useState(false);
  const [anonPrompt, setAnonPrompt] = useState(false);
  const [likeCount, setLikeCount] = useState(c.likeCount);
  const [likedByMe, setLikedByMe] = useState(c.likedByMe);
  const menuRef = useRef<HTMLDivElement>(null);

  // 5-min edit window countdown
  useEffect(() => {
    const created = new Date(c.createdAt).getTime();
    const expiry = created + EDIT_WINDOW_MS;
    const remaining = expiry - Date.now();
    if (remaining <= 0) { setEditExpired(true); return; }
    const t = setTimeout(() => setEditExpired(true), remaining);
    return () => clearTimeout(t);
  }, [c.createdAt]);

  // Close menu on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  async function handleLike() {
    if (!user) { setAnonPrompt(true); return; }
    // Optimistic
    const prev = { likeCount, likedByMe };
    setLikedByMe(!likedByMe);
    setLikeCount(likedByMe ? likeCount - 1 : likeCount + 1);
    try {
      const result = await reactComment(c.id);
      setLikeCount(result.likeCount);
      setLikedByMe(result.likedByMe);
    } catch {
      setLikeCount(prev.likeCount);
      setLikedByMe(prev.likedByMe);
    }
  }

  async function handleDelete() {
    if (!window.confirm('Xoá bình luận này?')) return;
    try {
      await deleteComment(c.id);
      onMutated();
    } catch {
      // ignore
    }
  }

  // Render body with @mention highlight and URL auto-link
  function renderBody(text: string) {
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    const combined = /(https?:\/\/[^\s]+)|@(\w+)/g;
    let key = 0;
    combined.lastIndex = 0;

    while ((match = combined.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.slice(lastIndex, match.index));
      }
      if (match[1]) {
        parts.push(
          <a key={key++} href={match[1]} target="_blank" rel="noopener noreferrer nofollow"
             className="text-accent underline underline-offset-2 break-all">
            {match[1]}
          </a>,
        );
      } else if (match[2]) {
        parts.push(
          <span key={key++} className="text-accent">@{match[2]}</span>,
        );
      }
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) parts.push(text.slice(lastIndex));
    return parts;
  }

  const isOwner = user?.id === c.userId;
  const isAdmin = user?.role === 'admin';

  return (
    <div id={`comment-${c.id}`} className="flex gap-3">
      {/* Avatar */}
      <div className="flex-shrink-0 h-8 w-8 rounded-full bg-bg-subtle border border-border flex items-center justify-center overflow-hidden">
        {c.user.image ? (
          <img src={c.user.image} alt={c.user.name} className="h-full w-full object-cover" />
        ) : (
          <span className="text-[11px] font-semibold text-fg-muted">
            {c.user.name?.charAt(0).toUpperCase() ?? '?'}
          </span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        {/* Header row */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-fg text-body-sm">{c.user.name}</span>
          <span className="text-body-sm text-fg-muted">{formatRelativeTime(c.createdAt)}</span>
          {c.editedAt && (
            <span className="text-[11px] text-fg-subtle italic">(đã sửa)</span>
          )}
        </div>

        {/* Body */}
        {editOpen ? (
          <CommentForm
            targetType={c.targetType}
            targetId={c.targetId}
            editCommentId={c.id}
            initialBody={c.body ?? ''}
            participants={participants}
            onSuccess={() => { setEditOpen(false); onMutated(); }}
            onCancel={() => setEditOpen(false)}
            autoFocus
          />
        ) : (
          <p className="font-prose text-body whitespace-pre-wrap mt-1 break-words">
            {renderBody(c.body ?? '')}
          </p>
        )}

        {/* Action row */}
        <div className="mt-2 flex items-center gap-3">
          {/* Like */}
          <button
            type="button"
            onClick={handleLike}
            className={`inline-flex items-center gap-1 text-body-sm cursor-pointer transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded ${
              likedByMe ? 'text-accent' : 'text-fg-muted hover:text-fg'
            }`}
            aria-label="Thích"
          >
            <Heart className={`h-4 w-4 ${likedByMe ? 'fill-accent text-accent' : ''}`} />
            {likeCount > 0 && <span>{likeCount}</span>}
          </button>

          {/* Reply */}
          <button
            type="button"
            onClick={() => {
              if (!user) { setAnonPrompt(true); return; }
              setReplyOpen((v) => !v);
            }}
            className="inline-flex items-center gap-1 text-body-sm text-fg-muted hover:text-fg cursor-pointer transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
          >
            <MessageCircle className="h-4 w-4" />
            Trả lời
          </button>

          {/* Edit/delete menu (owner or admin) */}
          {(isOwner || isAdmin) && (
            <div className="relative ml-auto" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className="inline-flex items-center justify-center h-7 w-7 rounded text-fg-muted hover:text-fg hover:bg-bg-subtle cursor-pointer transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                aria-label="Tuỳ chọn"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-8 z-50 w-44 rounded-lg border border-border bg-bg-elevated shadow-elev overflow-hidden">
                  {isOwner && (
                    <button
                      type="button"
                      disabled={editExpired}
                      onClick={() => { setEditOpen(true); setMenuOpen(false); }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-body-sm text-fg hover:bg-bg-subtle disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors duration-fast"
                    >
                      <Pencil className="h-4 w-4" />
                      Sửa {editExpired && '(hết hạn)'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => { void handleDelete(); setMenuOpen(false); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-body-sm text-destructive hover:bg-bg-subtle cursor-pointer transition-colors duration-fast"
                  >
                    <Trash2 className="h-4 w-4" />
                    {isAdmin && !isOwner ? 'Xoá (admin)' : 'Xoá'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Anonymous prompt */}
        {/* Use plain <a> (not TanStack <Link>) to avoid search-schema type constraint on /dang-nhap route.
            The redirect param is passed via URL so the login page can navigate back after auth. */}
        {anonPrompt && (
          <p className="mt-2 text-body-sm text-fg-muted">
            Đăng nhập để bình luận{' '}
            <a
              href={`/dang-nhap?redirect=${encodeURIComponent(path)}`}
              className="text-accent underline underline-offset-2 cursor-pointer"
            >
              tại đây
            </a>
          </p>
        )}

        {/* Inline reply form */}
        {replyOpen && (
          <div className="mt-3">
            <CommentForm
              targetType={c.targetType}
              targetId={c.targetId}
              parentId={c.id}
              participants={participants}
              onSuccess={() => { setReplyOpen(false); onMutated(); }}
              onCancel={() => setReplyOpen(false)}
              autoFocus
            />
          </div>
        )}
      </div>
    </div>
  );
}
