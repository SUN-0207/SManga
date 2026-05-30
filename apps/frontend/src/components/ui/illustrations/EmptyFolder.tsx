export function EmptyFolder() {
  return (
    <svg viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden className="w-full h-full">
      <defs>
        <linearGradient id="ef-accent" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--accent)" />
          <stop offset="100%" stopColor="var(--accent-strong)" />
        </linearGradient>
      </defs>
      <path
        d="M30 55 L30 120 Q30 130 40 130 L120 130 Q130 130 130 120 L130 70 Q130 60 120 60 L75 60 L65 50 L40 50 Q30 50 30 55 Z"
        fill="none"
        stroke="var(--border-strong)"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      {/* Pink corner accent */}
      <path
        d="M120 60 L130 70 L130 80 Z"
        fill="url(#ef-accent)"
      />
      <circle cx="80" cy="95" r="3" fill="var(--border-strong)" />
      <circle cx="68" cy="95" r="3" fill="var(--border-strong)" />
      <circle cx="92" cy="95" r="3" fill="var(--border-strong)" />
    </svg>
  );
}
