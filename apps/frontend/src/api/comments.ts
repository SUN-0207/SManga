import { api } from '@/lib/api-client';

export interface CommentTree {
  id: string;
  userId: string;
  user: { id: string; name: string; image: string | null };
  targetType: 'story' | 'chapter';
  targetId: string;
  parentId: string | null;
  depth: 1 | 2 | 3;
  body: string | null;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  likeCount: number;
  likedByMe: boolean;
  replies: CommentTree[];
}

export interface CommentPage {
  items: CommentTree[];
  total: number;
  page: number;
  limit: number;
}

export async function listComments(params: {
  targetType: 'story' | 'chapter';
  targetId: string;
  page?: number;
  limit?: number;
}): Promise<CommentPage> {
  const { data } = await api.get<CommentPage>('/comments', { params });
  return data;
}

export async function createComment(body: {
  targetType: string;
  targetId: string;
  parentId?: string;
  body: string;
}): Promise<CommentTree> {
  const { data } = await api.post<CommentTree>('/comments', body);
  return data;
}

export async function updateComment(
  id: string,
  body: { body: string },
): Promise<CommentTree> {
  const { data } = await api.patch<CommentTree>(`/comments/${id}`, body);
  return data;
}

export async function deleteComment(id: string): Promise<void> {
  await api.delete(`/comments/${id}`);
}

export async function reactComment(
  id: string,
): Promise<{ likeCount: number; likedByMe: boolean }> {
  const { data } = await api.post<{ likeCount: number; likedByMe: boolean }>(
    `/comments/${id}/react`,
  );
  return data;
}
