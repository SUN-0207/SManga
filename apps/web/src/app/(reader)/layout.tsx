import type { ReactNode } from 'react';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import { ReaderHeader } from '@/components/reader/ReaderHeader';

export default function ReaderLayout({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <div className="min-h-screen flex flex-col">
        <ReaderHeader />
        <main className="flex-1">{children}</main>
        <footer className="border-t border-border py-6 text-sm text-center text-muted-foreground">
          SManga · Đọc truyện chữ
        </footer>
      </div>
    </ThemeProvider>
  );
}
