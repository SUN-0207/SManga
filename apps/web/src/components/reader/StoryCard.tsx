import Link from 'next/link';
import { Badge } from '@/components/ui/badge';

export interface StoryCardProps {
  id: string;
  slug: string;
  title: string;
  author: string | null;
  status: 'ongoing' | 'completed' | 'dropped' | 'unknown';
  totalChapters: number;
  hasCover: boolean;
}

export function StoryCard(props: StoryCardProps) {
  return (
    <Link
      href={`/truyen/${props.slug}`}
      className="group flex flex-col rounded-lg border border-border bg-background overflow-hidden hover:border-primary/50 transition-colors"
    >
      <div className="aspect-[3/4] bg-muted overflow-hidden">
        {props.hasCover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/cover/${props.id}`}
            alt={`Bìa ${props.title}`}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
            Không có bìa
          </div>
        )}
      </div>
      <div className="p-3 flex flex-col gap-1">
        <h3 className="font-medium text-sm line-clamp-2 leading-snug">{props.title}</h3>
        <p className="text-xs text-muted-foreground line-clamp-1">{props.author ?? 'Khuyết danh'}</p>
        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
          <Badge variant="secondary" className="text-[10px]">
            {props.status === 'completed' ? 'Full' : props.status === 'ongoing' ? 'Đang ra' : props.status}
          </Badge>
          <span>{props.totalChapters} chương</span>
        </div>
      </div>
    </Link>
  );
}
