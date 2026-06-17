import { api } from '@/lib/api-client';

export interface NotificationSourceComment {
  id: string;
  targetType: 'story' | 'chapter';
  targetId: string;
  body: string | null;
  parentId: string | null;
  storySlug: string | null;
  chapterIndex: string | null;
}

export interface NotificationNewChapter {
  storySlug: string;
  storyTitle: string;
  newCount: number;
  targetChapterIndex: string;
}

export interface Notification {
  id: string;
  type: 'comment_reply' | 'comment_mention' | 'new_chapter';
  actor: { id: string; name: string; image: string | null } | null;
  sourceComment: NotificationSourceComment | null;
  newChapter: NotificationNewChapter | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationPage {
  items: Notification[];
  unreadCount: number;
}

export async function listNotifications(params?: {
  unreadOnly?: boolean;
  limit?: number;
}): Promise<NotificationPage> {
  const { data } = await api.get<NotificationPage>('/me/notifications', { params });
  return data;
}

export async function markNotificationsRead(ids?: string[]): Promise<void> {
  await api.post('/me/notifications/read', { ids });
}
