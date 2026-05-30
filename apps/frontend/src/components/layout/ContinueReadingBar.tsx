import { Link } from '@tanstack/react-router';
import { ChevronRight } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';

/**
 * Plan A: visible shell with placeholder. Plan C will replace the
 * placeholder data with `GET /me/continue-reading` query.
 *
 * Renders only when user is authenticated. Hidden by AppShell when on
 * chapter reader route.
 */
export function ContinueReadingBar() {
  const user = useAuthStore((s) => s.user);
  if (!user) return null;

  // Plan C: replace with useQuery(['me','continue-reading']). For now
  // return null so we don't render fake data in front of users. The
  // visual shell below is committed but unreachable until Plan C wires data.
  return null;

  // eslint-disable-next-line @typescript-eslint/no-unreachable -- shell preserved for Plan C
  // biome-ignore lint/correctness/noUnreachableCode: <explanation>
  return (
    <Link
      to="/"
      className="sticky top-14 z-20 block bg-accent-gradient-soft border-b border-accent/20 hover:bg-accent/12 transition-colors duration-fast"
    >
      <div className="container flex items-center h-10 sm:h-12 gap-3">
        <div
          aria-hidden
          className="h-7 w-5 sm:h-9 sm:w-7 bg-accent-gradient rounded-sm flex-shrink-0"
        />
        <div className="flex-1 min-w-0">
          <p className="text-[10px] sm:text-label text-fg-muted truncate">
            ĐỌC TIẾP · CHƯƠNG 47 / 671
          </p>
          <p className="text-body-sm sm:text-body font-semibold truncate">
            Xuyên Thư Chi Bá Ái Độc Thê
          </p>
        </div>
        <span className="hidden sm:inline-flex items-center h-7 px-3 rounded-md bg-fg text-bg text-body-sm font-semibold">
          Tiếp tục →
        </span>
        <ChevronRight className="sm:hidden h-5 w-5 text-accent" aria-hidden />
      </div>
    </Link>
  );
}
