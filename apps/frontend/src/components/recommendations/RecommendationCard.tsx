import { Link } from '@tanstack/react-router';
import { Sparkles } from 'lucide-react';
import type { RecommendationItem } from '@/api/recommendations';

interface Props {
  item: RecommendationItem;
}

export function RecommendationCard({ item }: Props) {
  return (
    <Link
      to="/truyen/$slug"
      params={{ slug: item.slug }}
      search={{ page: 1, commentsPage: 1 }}
      className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-md cursor-pointer"
    >
      <div className="relative aspect-[3/4] overflow-hidden rounded-md border border-border bg-bg-subtle">
        {item.hasCover ? (
          <img
            src={`/api/v1/cover/${item.id}`}
            alt={`Bìa ${item.title}`}
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
          />
        ) : null}
      </div>
      <h3 className="mt-3 text-heading-md line-clamp-2">{item.title}</h3>
      <p className="mt-1 text-body-sm text-fg-muted truncate">{item.author ?? 'Khuyết danh'}</p>
      <p className="mt-1 text-body-sm text-accent inline-flex items-center gap-1 truncate">
        <Sparkles className="h-3.5 w-3.5 flex-shrink-0" aria-hidden />
        {item.reason}
      </p>
    </Link>
  );
}
