import type { Notification } from '@/api/notifications';
import { formatRelativeTime } from '@/lib/format';

interface Props {
  notification: Notification;
  onClick?: () => void;
}

export function NotificationItem({ notification: n, onClick }: Props) {
  const actorName = n.actor?.name ?? '[Người dùng đã xoá]';
  const message =
    n.type === 'comment_reply'
      ? `${actorName} đã trả lời bình luận của bạn`
      : `${actorName} đã nhắc đến bạn trong bình luận`;

  const bodyPreview = n.sourceComment?.body
    ? n.sourceComment.body.slice(0, 80) + (n.sourceComment.body.length > 80 ? '…' : '')
    : '[đã xoá]';

  // Build deep-link href
  let href = '#';
  if (n.sourceComment?.storySlug && n.sourceComment.id) {
    if (n.sourceComment.targetType === 'story') {
      href = `/truyen/${n.sourceComment.storySlug}#comment-${n.sourceComment.id}`;
    } else if (n.sourceComment.chapterIndex) {
      href = `/truyen/${n.sourceComment.storySlug}/chuong/${n.sourceComment.chapterIndex}#comment-${n.sourceComment.id}`;
    }
  }

  return (
    <a
      href={href}
      onClick={onClick}
      className={`flex flex-col gap-1 px-4 py-3 text-left transition-colors duration-fast hover:bg-bg-subtle cursor-pointer ${
        !n.readAt ? 'bg-accent/5' : ''
      }`}
    >
      <p className="text-body-sm text-fg leading-snug">{message}</p>
      <p className="text-[11px] text-fg-muted line-clamp-1">{bodyPreview}</p>
      <p className="text-[11px] text-fg-subtle">{formatRelativeTime(n.createdAt)}</p>
    </a>
  );
}
