const SCRIM =
  'linear-gradient(120deg, rgba(12,6,10,0.74) 0%, rgba(45,12,30,0.5) 45%, rgba(236,72,153,0.30) 100%)';

export interface HeroCoverBackdropProps {
  storyId: string;
  hasCover: boolean;
  /** Drives crossfade opacity when stacked in a slider. Defaults to true. */
  active?: boolean;
}

/**
 * Decorative image-forward backdrop: the story's cover art blurred + darkened
 * under a dark→pink scrim. Used behind the homepage hero + continue-reading
 * card so color comes from content, not a global background tint.
 */
export function HeroCoverBackdrop({ storyId, hasCover, active = true }: HeroCoverBackdropProps) {
  return (
    <div
      aria-hidden
      className={`absolute inset-0 z-0 pointer-events-none transition-opacity duration-500 ease-out ${
        active ? 'opacity-100' : 'opacity-0'
      }`}
    >
      {hasCover ? (
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: `url(/api/v1/cover/${storyId})`,
            filter: 'blur(30px) saturate(1.45) brightness(0.92)',
            transform: 'scale(1.3)',
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-accent-gradient-soft" />
      )}
      <div className="absolute inset-0" style={{ background: SCRIM }} />
    </div>
  );
}
