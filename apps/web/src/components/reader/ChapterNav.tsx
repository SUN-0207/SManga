import Link from 'next/link';

export interface ChapterNavProps {
  slug: string;
  prev: { index: number; title: string } | null;
  next: { index: number; title: string } | null;
  current: number;
}

export function ChapterNav({ slug, prev, next, current }: ChapterNavProps) {
  return (
    <nav className="flex items-center justify-between gap-3 py-4">
      <div className="flex-1">
        {prev && (
          <Link
            href={`/truyen/${slug}/chuong-${prev.index}`}
            className="inline-flex items-center gap-1 text-sm hover:underline"
          >
            ‹ Chương {prev.index}
          </Link>
        )}
      </div>
      <Link href={`/truyen/${slug}`} className="text-sm text-muted-foreground hover:underline">
        Mục lục (đang ở chương {current})
      </Link>
      <div className="flex-1 text-right">
        {next && (
          <Link
            href={`/truyen/${slug}/chuong-${next.index}`}
            className="inline-flex items-center gap-1 text-sm hover:underline"
          >
            Chương {next.index} ›
          </Link>
        )}
      </div>
    </nav>
  );
}
