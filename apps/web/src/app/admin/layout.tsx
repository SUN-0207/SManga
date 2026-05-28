import type { ReactNode } from 'react';
import Link from 'next/link';
import { auth, signOut } from '@/server/auth';
import { Button } from '@/components/ui/button';

const NAV = [
  { href: '/admin', label: 'Tổng quan' },
  { href: '/admin/sources', label: 'Sources' },
  { href: '/admin/stories', label: 'Truyện' },
  { href: '/admin/jobs', label: 'Jobs' },
];

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  const email = (session?.user?.email as string | undefined) ?? '';
  return (
    <div className="min-h-screen flex">
      <aside className="w-56 border-r border-border bg-muted/30 p-4 space-y-1">
        <Link href="/admin" className="block font-semibold text-lg mb-4">SManga Admin</Link>
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className="block rounded px-3 py-2 hover:bg-muted text-sm">
            {n.label}
          </Link>
        ))}
      </aside>
      <main className="flex-1 p-6">
        <div className="flex items-center justify-end gap-4 mb-6 text-sm">
          <span className="text-muted-foreground">{email}</span>
          <form
            action={async () => {
              'use server';
              await signOut({ redirectTo: '/' });
            }}
          >
            <Button variant="outline" size="sm" type="submit">Đăng xuất</Button>
          </form>
        </div>
        {children}
      </main>
    </div>
  );
}
