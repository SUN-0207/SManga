export function EmptyQueue() {
  return (
    <svg
      viewBox="0 0 160 160"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className="w-full h-full"
    >
      <title>Không có job nào</title>
      <defs>
        <linearGradient id="eq-accent" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--accent)" />
          <stop offset="100%" stopColor="var(--accent-strong)" />
        </linearGradient>
      </defs>
      <circle cx="80" cy="80" r="48" fill="none" stroke="var(--border-strong)" strokeWidth="3" />
      <line
        x1="80"
        y1="80"
        x2="80"
        y2="48"
        stroke="url(#eq-accent)"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <line
        x1="80"
        y1="80"
        x2="104"
        y2="92"
        stroke="var(--border-strong)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="80" cy="80" r="4" fill="url(#eq-accent)" />
      <circle cx="80" cy="32" r="2" fill="var(--border-strong)" />
      <circle cx="128" cy="80" r="2" fill="var(--border-strong)" />
      <circle cx="80" cy="128" r="2" fill="var(--border-strong)" />
      <circle cx="32" cy="80" r="2" fill="var(--border-strong)" />
    </svg>
  );
}
