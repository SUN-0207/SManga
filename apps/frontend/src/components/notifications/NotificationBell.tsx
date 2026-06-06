import { listNotifications, markNotificationsRead } from '@/api/notifications';
import type { Notification } from '@/api/notifications';
import { useAuthStore } from '@/stores/auth-store';
import { Bell } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { NotificationItem } from './NotificationItem';

const POLL_INTERVAL_MS = 30_000;

export function NotificationBell() {
  const user = useAuthStore((s) => s.user);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // pausedRef mirrors paused state so interval closures always read the current value
  // (interval callbacks capture the initial render's paused=false via closure otherwise)
  const pausedRef = useRef(false);

  async function fetchNotifications() {
    if (pausedRef.current) return;
    try {
      const data = await listNotifications({ limit: 30 });
      setItems(data.items);
      setUnreadCount(data.unreadCount);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 401) {
        pausedRef.current = true;
        setUnreadCount(0);
        if (intervalRef.current) clearInterval(intervalRef.current);
      }
    }
  }

  // Polling setup — all hooks must be called unconditionally before any early return
  useEffect(() => {
    if (!user) return;
    void fetchNotifications();

    function startPolling() {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(() => {
        if (!document.hidden) void fetchNotifications();
      }, POLL_INTERVAL_MS);
    }

    function handleVisibility() {
      if (document.hidden) {
        if (intervalRef.current) clearInterval(intervalRef.current);
      } else {
        void fetchNotifications();
        startPolling();
      }
    }

    startPolling();
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // All hooks called above — now safe to do conditional render
  if (!user) return null;

  async function handleOpen() {
    const next = !open;
    setOpen(next);
    if (next && items.length > 0) {
      // Mark visible unread items as read
      const unreadIds = items.filter((n) => !n.readAt).map((n) => n.id);
      if (unreadIds.length > 0) {
        setUnreadCount(0);
        setItems((prev) =>
          prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })),
        );
        try {
          await markNotificationsRead(unreadIds);
        } catch {
          // best-effort
        }
      }
    }
  }

  const badgeDisplay = unreadCount > 9 ? '9+' : String(unreadCount);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        aria-label="Thông báo"
        onClick={handleOpen}
        className="relative inline-flex items-center justify-center h-9 w-9 rounded-md text-fg-muted hover:bg-bg-subtle hover:text-fg transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent cursor-pointer"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-bg text-[10px] flex items-center justify-center font-semibold leading-none">
            {badgeDisplay}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-80 max-h-96 overflow-y-auto bg-bg-elevated border border-border shadow-elev rounded-lg">
          <div className="sticky top-0 px-4 py-2 border-b border-border bg-bg-elevated">
            <p className="text-body-sm font-semibold text-fg">Thông báo</p>
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-body-sm text-fg-muted">Chưa có thông báo</p>
          ) : (
            <div className="divide-y divide-border/40">
              {items.map((n) => (
                <NotificationItem key={n.id} notification={n} onClick={() => setOpen(false)} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
