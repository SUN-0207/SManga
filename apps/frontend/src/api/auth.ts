import { api } from '@/lib/api-client';

export interface User {
  id: string;
  email: string;
  name: string | null;
  role: 'user' | 'admin';
}

export async function login(email: string, password: string): Promise<{ user: User }> {
  const res = await api.post('/auth/login', { email, password });
  return res.data as { user: User };
}

export async function register(email: string, password: string, name?: string): Promise<{ id: string; email: string }> {
  const res = await api.post('/auth/register', { email, password, name });
  return res.data as { id: string; email: string };
}

export async function logout(): Promise<void> {
  await api.post('/auth/logout');
}

export async function me(): Promise<User | null> {
  try {
    const res = await api.get<User>('/auth/me');
    return res.data;
  } catch {
    return null;
  }
}
