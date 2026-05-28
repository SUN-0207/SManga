import { BookOpen } from 'lucide-react';
import { StoryCard, type StoryCardProps } from './StoryCard';

export function StoryGrid({ stories }: { stories: StoryCardProps[] }) {
  if (stories.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <BookOpen className="h-10 w-10 text-muted-foreground/40" />
        <p className="font-heading text-lg">Chưa có truyện nào</p>
        <p className="text-sm text-muted-foreground max-w-sm">
          Vào trang quản trị để import truyện đầu tiên từ các nguồn được hỗ trợ.
        </p>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-5 gap-y-8">
      {stories.map((s) => (
        <StoryCard key={s.id} {...s} />
      ))}
    </div>
  );
}
