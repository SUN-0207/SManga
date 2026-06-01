import { Link } from '@tanstack/react-router';
import { BookText } from 'lucide-react';
import { RatingStars } from '@/components/engagement/RatingStars';
import { ViewCount }   from '@/components/engagement/ViewCount';

export interface StoryCardProps {
  id: string;
  slug: string;
  title: string;
  author: string | null;
  status: 'ongoing' | 'completed' | 'dropped' | 'unknown';
  totalChapters: number;
  hasCover: boolean;
  /** Plan D: optional — zero/absent on cards passed from callers not yet updated */
  ratingAvg?:    number | null;
  ratingCount?:  number;
  viewCount?:    number;
}

const STATUS_LABEL: Record<StoryCardProps['status'], string> = {
  ongoing: 'Đang ra',
  completed: 'Full',
  dropped: 'Tạm dừng',
  unknown: '—',
};

const STATUS_TONE: Record<string, string> = {
  completed: "bg-fg text-bg",
  ongoing: "bg-accent text-white",
  dropped: "bg-bg-subtle text-fg-muted",
  unknown: "bg-bg-subtle text-fg-muted",
};

export function StoryCard(props: StoryCardProps) {
  const statusTone = STATUS_TONE[props.status];

  return (
    <Link
      to="/truyen/$slug"
      params={{ slug: props.slug }}
      search={{ page: 1, commentsPage: 1 }}
      className="group flex flex-col gap-3 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-md"
    >
      <div className="relative aspect-[3/4] overflow-hidden rounded-md bg-bg-subtle shadow-elev transition-shadow duration-fast group-hover:shadow-glow-pink-soft">
        {props.hasCover ? (
          <img
            src={`/api/v1/cover/${props.id}`}
            alt={`Bìa ${props.title}`}
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-fg-muted gap-2">
            <BookText className="h-6 w-6" />
            <span className="text-[10px] uppercase tracking-widest">Không có bìa</span>
          </div>
        )}
        <span
          className={`absolute top-2 left-2 inline-flex items-center h-5 px-2 rounded-full text-[10px] font-medium tracking-wide ${statusTone}`}
        >
          {STATUS_LABEL[props.status]}
        </span>
      </div>
      <div className="flex flex-col gap-1 px-0.5">
        <h3 className="font-prose text-body font-semibold text-fg transition-colors duration-fast group-hover:text-accent">
          {props.title}
        </h3>
        <p className="text-body-sm text-fg-muted">{props.author ?? 'Khuyết danh'}</p>
        <p className="text-body-sm text-fg-subtle">{props.totalChapters} chương</p>
        {/* Plan D: micro engagement — render only when at least one signal is non-zero */}
        {((props.ratingCount ?? 0) > 0 || (props.viewCount ?? 0) > 0) && (
          <div className="flex items-center gap-2 flex-wrap">
            {(props.ratingCount ?? 0) > 0 && (
              <RatingStars value={props.ratingAvg ?? null} size="sm" />
            )}
            {(props.viewCount ?? 0) > 0 && (
              <ViewCount count={props.viewCount!} />
            )}
          </div>
        )}
      </div>
    </Link>
  );
}
