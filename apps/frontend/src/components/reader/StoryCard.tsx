import { Link } from '@tanstack/react-router';
import { BookText } from 'lucide-react';

export interface StoryCardProps {
  id: string;
  slug: string;
  title: string;
  author: string | null;
  status: 'ongoing' | 'completed' | 'dropped' | 'unknown';
  totalChapters: number;
  hasCover: boolean;
}

const STATUS_LABEL: Record<StoryCardProps['status'], string> = {
  ongoing: 'Đang ra',
  completed: 'Full',
  dropped: 'Tạm dừng',
  unknown: '—',
};

const STATUS_TONE: Record<StoryCardProps['status'], string> = {
  completed: 'bg-foreground text-background',
  ongoing: 'bg-[hsl(var(--color-cta))] text-white',
  dropped: 'bg-muted text-muted-foreground',
  unknown: 'bg-muted text-muted-foreground',
};

export function StoryCard(props: StoryCardProps) {
  const statusTone = STATUS_TONE[props.status];

  return (
    <Link
      to="/truyen/$slug"
      params={{ slug: props.slug }}
      search={{ page: 1 }}
      className="group flex flex-col gap-3 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-xl"
    >
      <div className="relative aspect-[3/4] bg-muted overflow-hidden rounded-xl shadow-[0_8px_24px_-12px_rgba(0,0,0,0.18)] transition-all duration-300 group-hover:shadow-[0_20px_40px_-16px_rgba(0,0,0,0.25)] group-hover:-translate-y-1">
        {props.hasCover ? (
          <img
            src={`/api/v1/cover/${props.id}`}
            alt={`Bìa ${props.title}`}
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground gap-2">
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
        <h3 className="font-heading font-semibold text-[15px] leading-snug line-clamp-2 tracking-tight transition-colors duration-200 group-hover:text-foreground">
          {props.title}
        </h3>
        <p className="text-xs text-muted-foreground line-clamp-1">
          {props.author ?? 'Khuyết danh'}
        </p>
        <p className="text-[11px] text-muted-foreground/80 mt-0.5">
          {props.totalChapters} chương
        </p>
      </div>
    </Link>
  );
}
