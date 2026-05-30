export function EmptySearch() {
  return (
    <svg viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden className="w-full h-full">
      <defs>
        <linearGradient id="es-accent" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--accent)" />
          <stop offset="100%" stopColor="var(--accent-strong)" />
        </linearGradient>
      </defs>
      <circle cx="68" cy="68" r="34" fill="none" stroke="var(--border-strong)" strokeWidth="3" />
      <line x1="94" y1="94" x2="124" y2="124" stroke="url(#es-accent)" strokeWidth="5" strokeLinecap="round" />
      <text
        x="68"
        y="80"
        textAnchor="middle"
        fill="url(#es-accent)"
        fontFamily="Newsreader, serif"
        fontWeight="700"
        fontSize="38"
      >
        ?
      </text>
    </svg>
  );
}
