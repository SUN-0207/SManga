import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { me } from '@/api/auth';
import { useAuthStore } from '@/stores/auth-store';

export function useMeQuery() {
  const setUser = useAuthStore((s) => s.setUser);
  const query = useQuery({
    queryKey: ['me'],
    queryFn: me,
    staleTime: 60_000,
  });
  useEffect(() => {
    if (query.data !== undefined) setUser(query.data);
  }, [query.data, setUser]);
  return query;
}
