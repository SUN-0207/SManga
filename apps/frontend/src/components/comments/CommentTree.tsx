import type { CommentTree as CommentTreeType } from '@/api/comments';
import type { Participant } from '@/hooks/use-mention-autocomplete';
import { CommentItem } from './CommentItem';
import { DeletedCommentItem } from './DeletedCommentItem';

interface Props {
  comment: CommentTreeType;
  participants: Participant[];
  onMutated: () => void;
}

function indentClass(depth: number) {
  if (depth === 2) return 'pl-6 sm:pl-10';
  if (depth === 3) return 'pl-10 sm:pl-16';
  return '';
}

export function CommentTree({ comment: c, participants, onMutated }: Props) {
  return (
    <div className="space-y-4">
      {c.deletedAt ? (
        <DeletedCommentItem>
          {c.replies.length > 0 && (
            <div className={`space-y-4 mt-2 ${indentClass(c.depth + 1)}`}>
              {c.replies.map((reply) => (
                <CommentTree
                  key={reply.id}
                  comment={reply}
                  participants={participants}
                  onMutated={onMutated}
                />
              ))}
            </div>
          )}
        </DeletedCommentItem>
      ) : (
        <>
          <CommentItem comment={c} participants={participants} onMutated={onMutated} />
          {c.replies.length > 0 && (
            <div className={`space-y-4 border-l-2 border-border/40 ${indentClass(c.depth + 1)}`}>
              {c.replies.map((reply) => (
                <CommentTree
                  key={reply.id}
                  comment={reply}
                  participants={participants}
                  onMutated={onMutated}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
