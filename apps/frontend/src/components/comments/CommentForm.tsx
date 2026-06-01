import { useRef, useState } from 'react';
import { createComment, updateComment } from '@/api/comments';
import type { CommentTree } from '@/api/comments';
import type { Participant } from '@/hooks/use-mention-autocomplete';
import { useMentionAutocomplete } from '@/hooks/use-mention-autocomplete';

interface Props {
  targetType: 'story' | 'chapter';
  targetId: string;
  parentId?: string;
  /** When provided, the form PATCHes the existing comment instead of creating a new one. */
  editCommentId?: string;
  /** Initial body text for edit mode. */
  initialBody?: string;
  participants: Participant[];
  onSuccess: (c: CommentTree) => void;
  onCancel?: () => void;
  autoFocus?: boolean;
}

export function CommentForm({ targetType, targetId, parentId, editCommentId, initialBody, participants, onSuccess, onCancel, autoFocus }: Props) {
  const [body, setBody] = useState(initialBody ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { suggestions, selectedIndex, onSelect, onKeyDown, detect, active } =
    useMentionAutocomplete(participants, body, setBody);

  // textareaRef is kept for future focus management
  void textareaRef;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (body.trim().length === 0 || submitting) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      let result: CommentTree;
      if (editCommentId) {
        result = await updateComment(editCommentId, { body });
      } else {
        result = await createComment({ targetType, targetId, parentId, body });
      }
      if (!editCommentId) setBody('');
      onSuccess(result);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number; headers?: Record<string, string> } })?.response?.status;
      if (status === 429) {
        const retryAfter = (err as { response?: { headers?: Record<string, string> } })?.response?.headers?.['retry-after'];
        const minutes = retryAfter ? Math.ceil(Number(retryAfter) / 60) : 60;
        setErrorMsg(`Bạn bình luận quá nhanh — thử lại sau ${minutes} phút`);
      } else {
        setErrorMsg('Có lỗi xảy ra. Vui lòng thử lại.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="relative">
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={body}
          autoFocus={autoFocus}
          maxLength={2000}
          placeholder="Viết bình luận..."
          rows={3}
          className="w-full resize-none rounded-lg border border-border bg-bg px-3 py-2 text-body text-fg placeholder:text-fg-muted focus:outline-none focus:ring-2 focus:ring-accent transition-colors duration-fast"
          onChange={(e) => {
            const val = e.target.value;
            setBody(val);
            detect(val, e.target.selectionStart ?? val.length);
          }}
          onKeyDown={(e) => {
            const consumed = onKeyDown(e);
            if (consumed) { e.preventDefault(); e.stopPropagation(); }
          }}
        />

        {/* Character counter shown when >1500 */}
        {body.length > 1500 && (
          <span className={`absolute bottom-2 right-2 text-[11px] ${body.length >= 2000 ? 'text-destructive' : 'text-fg-muted'}`}>
            {body.length}/2000
          </span>
        )}

        {/* Mention autocomplete popup */}
        {active && (
          <ul
            role="listbox"
            className="absolute left-0 z-50 mt-1 w-56 rounded-lg border border-border bg-bg-elevated shadow-elev overflow-hidden"
            style={{ top: '100%' }}
          >
            {suggestions.map((s, i) => (
              <li
                key={s.id}
                role="option"
                aria-selected={i === selectedIndex}
                className={`px-3 py-2 text-body-sm cursor-pointer transition-colors duration-fast ${
                  i === selectedIndex ? 'bg-accent/10 text-accent' : 'text-fg hover:bg-bg-subtle'
                }`}
                onMouseDown={(e) => {
                  e.preventDefault(); // prevent textarea blur
                  onSelect(s.name);
                }}
              >
                @{s.name}
              </li>
            ))}
          </ul>
        )}
      </div>

      {errorMsg && (
        <p role="status" aria-live="polite" className="mt-1 text-body-sm text-destructive">
          {errorMsg}
        </p>
      )}

      <div className="mt-2 flex items-center justify-end gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="h-8 px-3 rounded-md text-body-sm text-fg-muted hover:text-fg transition-colors duration-fast cursor-pointer"
          >
            Huỷ
          </button>
        )}
        <button
          type="submit"
          disabled={body.trim().length === 0 || submitting}
          className="h-8 px-4 rounded-md text-body-sm font-semibold bg-accent text-white disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity duration-fast cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {submitting ? 'Đang gửi...' : 'Gửi'}
        </button>
      </div>
    </form>
  );
}
