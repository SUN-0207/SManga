import type { StorySummary } from '@/api/stories';
import { MoiCapNhatGrid } from './MoiCapNhatGrid';
import { TruyenGoiYSidebar } from './TruyenGoiYSidebar';

/**
 * 2-column home section (metruyenchu-style):
 *  - lg+: main grid (~1fr) + 320px sidebar, gap-8
 *  - <lg: stack — grid on top, sidebar below
 * Sidebar uses lg:sticky internally so it stays visible while the long left
 * column scrolls.
 */
export function TwoColumnSection({
  stories,
  isLoading,
}: {
  stories: StorySummary[];
  isLoading: boolean;
}) {
  return (
    <section className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-8 lg:gap-10 items-start">
      <MoiCapNhatGrid stories={stories} isLoading={isLoading} />
      <TruyenGoiYSidebar />
    </section>
  );
}
