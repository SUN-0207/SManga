import { StoryCard, type StoryCardProps } from './StoryCard';

export function StoryGrid({ stories }: { stories: StoryCardProps[] }) {
  if (stories.length === 0) {
    return (
      <p className="text-center text-muted-foreground py-12">
        Chưa có truyện nào. Vào trang admin để import truyện đầu tiên.
      </p>
    );
  }
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
      {stories.map((s) => (
        <StoryCard key={s.id} {...s} />
      ))}
    </div>
  );
}
