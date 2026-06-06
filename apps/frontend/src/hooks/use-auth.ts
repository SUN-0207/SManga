import { me } from '@/api/auth';
import { useAuthStore } from '@/stores/auth-store';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

/**
 * Fetch /auth/me once on app load and mirror the result into the auth store.
 *
 * Once the response comes back as `null` (logged out), don't re-poll: it
 * spams the console with 401s and the only thing that would change the
 * answer is an explicit login flow that already calls `setUser` directly.
 *
 * If the response is a user, allow refetch on window focus so a server-side
 * session expiry surfaces fairly quickly.
 */
export function useMeQuery() {
  const setUser = useAuthStore((s) => s.setUser);
  const queryClient = useQueryClient();
  const cached = queryClient.getQueryData<Awaited<ReturnType<typeof me>>>(['me']);
  const knownLoggedOut = cached === null;

  const query = useQuery({
    queryKey: ['me'],
    queryFn: me,
    staleTime: 5 * 60_000,
    retry: false,
    enabled: !knownLoggedOut,
    refetchOnWindowFocus: !knownLoggedOut,
  });

  useEffect(() => {
    if (query.data !== undefined) setUser(query.data);
  }, [query.data, setUser]);

  return query;
}
