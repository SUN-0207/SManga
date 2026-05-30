import { api } from '@/lib/api-client';

export interface User {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
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

export async function updateMe(patch: { name?: string; image?: string | null }): Promise<User> {
  const res = await api.patch<User>('/auth/me', patch);
  return res.data;
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await api.post('/auth/change-password', { currentPassword, newPassword });
}

export interface AuthProviders {
  google: boolean;
}

export async function getAuthProviders(): Promise<AuthProviders> {
  const res = await api.get<AuthProviders>('/auth/providers');
  return res.data;
}

/** Build the URL that starts the Google OAuth flow with a post-login redirect. */
export function googleLoginUrl(redirect: string): string {
  const base = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';
  return `${base}/auth/google?redirect=${encodeURIComponent(redirect)}`;
}
