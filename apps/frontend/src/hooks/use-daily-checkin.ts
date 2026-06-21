import { cultivationApi } from '@/api/cultivation';
import { useAuthStore } from '@/stores/auth-store';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

export interface CheckinBanner {
  message: string | null;
}

/**
 * Fires POST /me/checkin once per app load for a logged-in user.
 * If credited, surfaces a transient message and invalidates ['me','cultivation'].
 *
 * Pattern modelled on useInlineToast in RatingControl.tsx — no global toast lib.
 */
export function useDailyCheckin(): CheckinBanner {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const firedRef = useRef(false);

  useEffect(() => {
    if (!user || firedRef.current) return;
    firedRef.current = true;

    cultivationApi
      .checkin()
      .then((result) => {
        if (result.credited) {
          setMessage(
            `Điểm danh ngày ${result.streakDay}: +${result.amount.toLocaleString('vi-VN')} linh thạch`,
          );
          qc.invalidateQueries({ queryKey: ['me', 'cultivation'] }).catch(() => undefined);
        }
      })
      .catch(() => {
        // Silently ignore — gamification may be disabled or user not eligible
      });
  }, [user, qc]);

  // Auto-dismiss banner after 4 s
  useEffect(() => {
    if (!message) return;
    const id = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(id);
  }, [message]);

  return { message };
}
