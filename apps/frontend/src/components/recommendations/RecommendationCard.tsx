import type { RecommendationItem } from '@/api/recommendations';
import { StoryCover } from '@/components/ui/StoryCover';
import { Link } from '@tanstack/react-router';
import { Sparkles } from 'lucide-react';

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
        <StoryCover
          storyId={item.id}
          title={item.title}
          hasCover={item.hasCover}
          decorative
          imgClassName="absolute inset-0 transition-transform duration-200 group-hover:scale-105"
        />
      </div>
      <h3 className="mt-3 text-heading-md line-clamp-2">{item.title}</h3>
      <p className="mt-1 text-body-sm text-fg-muted truncate">{item.author ?? 'Khuyết danh'}</p>
      <p className="mt-1 flex items-center gap-1 text-body-sm text-accent">
        <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="truncate">{item.reason}</span>
      </p>
    </Link>
  );
}
