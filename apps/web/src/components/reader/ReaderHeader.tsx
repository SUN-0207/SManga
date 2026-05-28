'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ReaderSettings } from './ReaderSettings';

export function ReaderHeader() {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <header className="border-b border-border">
      <div className="container flex items-center justify-between py-4">
        <Link href="/" className="text-xl font-bold">
          SManga
        </Link>
        <div className="flex items-center gap-2">
          <Link href="/" className="text-sm hover:underline">Trang chủ</Link>
          <Button variant="ghost" size="sm" onClick={() => setSettingsOpen((v) => !v)} aria-expanded={settingsOpen}>
            Cài đặt
          </Button>
        </div>
      </div>
      {settingsOpen && (
        <div className="border-t border-border bg-muted/30">
          <div className="container py-4">
            <ReaderSettings />
          </div>
        </div>
      )}
    </header>
  );
}
