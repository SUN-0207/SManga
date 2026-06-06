import { api } from '@/lib/api-client';

export interface AdminUserRow {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  role: 'user' | 'admin';
  createdAt: string;
  hasPassword: boolean;
}

export interface AdminUserListResponse {
  items: AdminUserRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export async function listAdminUsers(params: {
  page?: number;
  limit?: number;
  q?: string;
}): Promise<AdminUserListResponse> {
  const res = await api.get<AdminUserListResponse>('/admin/users', { params });
  return res.data;
}

export async function updateUserRole(id: string, role: 'user' | 'admin') {
  const res = await api.patch<{ id: string; role: 'user' | 'admin' }>(`/admin/users/${id}/role`, {
    role,
  });
  return res.data;
}

export async function deleteUser(id: string) {
  await api.delete(`/admin/users/${id}`);
}
