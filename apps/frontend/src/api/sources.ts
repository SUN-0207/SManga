import { api } from '@/lib/api-client';

export interface Source {
  id: string;
  name: string;
  baseUrl: string;
  isActive: boolean;
  rateLimitRps: string;
}

export const sourcesApi = {
  list: () => api.get<Source[]>('/sources').then((r) => r.data),
  create: (body: { id: string; name: string; baseUrl: string; rateLimitRps: number }) =>
    api.post('/sources', body).then((r) => r.data),
  remove: (id: string) => api.delete(`/sources/${id}`).then((r) => r.data),
};
