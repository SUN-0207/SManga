export function EmptyBookshelf() {
  return (
    <svg
      viewBox="0 0 160 160"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className="w-full h-full"
    >
      <title>Tủ sách trống</title>
      <defs>
        <linearGradient id="bs-accent" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--accent)" />
          <stop offset="100%" stopColor="var(--accent-strong)" />
        </linearGradient>
      </defs>
      {/* Shelf base */}
      <rect x="20" y="120" width="120" height="6" rx="2" fill="var(--border-strong)" />
      {/* Ghost book 1 (left) */}
      <rect
        x="30"
        y="50"
        width="22"
        height="70"
        rx="3"
        fill="none"
        stroke="var(--border-strong)"
        strokeWidth="2"
        strokeDasharray="4 4"
      />
      {/* Accent book (middle, pink gradient) */}
      <rect x="60" y="40" width="26" height="80" rx="3" fill="url(#bs-accent)" />
      <rect x="64" y="50" width="18" height="2" rx="1" fill="white" opacity="0.6" />
      <rect x="64" y="56" width="14" height="2" rx="1" fill="white" opacity="0.4" />
      {/* Ghost book 2 (right) */}
      <rect
        x="94"
        y="55"
        width="22"
        height="65"
        rx="3"
        fill="none"
        stroke="var(--border-strong)"
        strokeWidth="2"
        strokeDasharray="4 4"
      />
      {/* Sparkle */}
      <circle cx="120" cy="40" r="3" fill="url(#bs-accent)" />
      <circle cx="40" cy="35" r="2" fill="url(#bs-accent)" opacity="0.5" />
    </svg>
  );
}
