import { scrollPercent } from '@/lib/reader-progress';
import { useEffect, useState } from 'react';

/**
 * Fixed top scroll-progress bar. Owns its own rAF-throttled scroll listener and
 * progress state, so the high-frequency (60 fps) progress updates re-render ONLY
 * this tiny subtree — not the whole ChapterReader (which would otherwise re-run
 * the paragraph split + drop-cap regex over the full chapter on every frame).
 */
export function ReadingProgressBar() {
  const [progress, setProgress] = useState(0);
  const reduceMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    let raf = 0;
    let ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      raf = requestAnimationFrame(() => {
        const doc = document.documentElement;
        setProgress(scrollPercent(window.scrollY, doc.scrollHeight, window.innerHeight));
        ticking = false;
      });
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll(); // initialize for short pages / restored scroll position
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      role="progressbar"
      tabIndex={-1}
      aria-valuenow={Math.round(progress)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Tiến độ đọc"
      className="fixed top-0 left-0 right-0 h-0.5 bg-bg-subtle z-50"
    >
      <div
        className="h-full bg-accent-gradient shadow-glow-pink-soft"
        style={{ width: `${progress}%`, transition: reduceMotion ? 'none' : 'width 100ms linear' }}
      />
    </div>
  );
}
