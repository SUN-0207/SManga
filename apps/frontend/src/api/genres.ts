import { api } from '@/lib/api-client';

export interface Genre {
  slug: string;
  name: string;
  storyCount: number;
}

/** Returns all genres sorted by storyCount DESC then alphabetically. */
export async function listGenres(): Promise<Genre[]> {
  const res = await api.get<Genre[]>('/genres');
  return res.data;
}
