import { listGenres } from '@/api/genres';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';

const TOP_N = 8;

export function FooterGenreBlock() {
  const genresQ = useQuery({
    queryKey: ['genres'],
    queryFn: listGenres,
    staleTime: 60 * 60_000,
  });
  const top = (genresQ.data ?? []).filter((g) => g.storyCount > 0).slice(0, TOP_N);
  if (top.length === 0) return null;

  return (
    <div className="text-body-sm">
      <h4 className="text-label text-fg-muted uppercase mb-3">Khám phá theo thể loại</h4>
      <ul className="flex flex-wrap gap-x-4 gap-y-2 list-none p-0">
        {top.map((g) => (
          <li key={g.slug}>
            <Link
              to="/kham-pha"
              search={{ q: '', page: 1, genre: g.slug }}
              className="text-fg-muted hover:text-fg transition-colors duration-fast"
            >
              {g.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
