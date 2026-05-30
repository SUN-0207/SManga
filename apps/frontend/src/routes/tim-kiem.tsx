import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/tim-kiem')({
  validateSearch: (s: Record<string, unknown>) => ({
    q: typeof s.q === 'string' ? s.q : '',
    page: Number(s.page) || 1,
  }),
  beforeLoad: ({ search }) => {
    throw redirect({
      to: '/kham-pha',
      search: { q: search.q, page: search.page, genre: undefined },
    });
  },
  component: () => null,
});
