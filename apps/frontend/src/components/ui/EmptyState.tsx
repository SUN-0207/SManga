import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';

/**
 * EmptyState — unified empty-surface primitive for Spec C.
 *
 * Typing trade-off: `to` is typed as `string` (and `search`/`params` as plain records)
 * rather than indexing `LinkProps['to']`. TanStack Router's `LinkProps['to']` is a
 * heavily-generic mapped type that collapses to a loose form once erased through this
 * boundary; the previous attempt used `as never` casts that erased the safety anyway.
 * Accepting an explicit `string` keeps the primitive simple and avoids forcing every
 * call site to satisfy the router's full conditional types. The trade-off: a caller
 * passing `to="/truyen/$slug"` without `params` will navigate to a literal
 * `'/truyen/$slug'`. Callers must pass `params` when the route has dynamic segments.
 */
export interface EmptyStateProps {
  illustration: ReactNode;
  title: string;
  description: string;
  cta?:
    | {
        label: string;
        to: string;
        search?: Record<string, unknown>;
        params?: Record<string, string>;
      }
    | { label: string; onClick: () => void };
}

export function EmptyState({ illustration, title, description, cta }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center text-center py-16 px-4">
      <div className="mb-6 w-32 h-32 sm:w-40 sm:h-40">{illustration}</div>
      <h3 className="text-heading-md sm:text-heading-lg">{title}</h3>
      <p className="mt-2 max-w-md text-body-sm sm:text-body text-fg-muted">{description}</p>
      {cta && 'to' in cta && (
        <Link
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          to={cta.to as any}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          search={cta.search as any}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          params={cta.params as any}
          className="mt-6 inline-flex items-center gap-2 h-10 px-5 rounded-md bg-accent-gradient text-white text-body-sm font-semibold shadow-glow-pink-soft hover:shadow-glow-pink transition-shadow duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
        >
          {cta.label} →
        </Link>
      )}
      {cta && 'onClick' in cta && (
        <button
          type="button"
          onClick={cta.onClick}
          className="mt-6 inline-flex items-center gap-2 h-10 px-5 rounded-md bg-accent-gradient text-white text-body-sm font-semibold shadow-glow-pink-soft hover:shadow-glow-pink transition-shadow duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg cursor-pointer"
        >
          {cta.label}
        </button>
      )}
    </div>
  );
}
