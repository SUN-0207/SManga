import { useQuery } from '@tanstack/react-query';
import { getAuthProviders, googleLoginUrl } from '@/api/auth';

export function GoogleButton({ redirect, label }: { redirect: string; label: string }) {
  const providersQ = useQuery({
    queryKey: ['auth', 'providers'],
    queryFn: getAuthProviders,
    staleTime: 5 * 60_000,
    retry: false,
  });

  if (!providersQ.data?.google) return null;

  return (
    <div className="space-y-4">
      <a
        href={googleLoginUrl(redirect)}
        className="w-full inline-flex items-center justify-center gap-2.5 h-11 rounded-md border border-border bg-background text-sm font-medium hover:border-foreground/40 hover:bg-muted/60 transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <GoogleGlyph />
        {label}
      </a>
      <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
        <span aria-hidden className="h-px flex-1 bg-border" />
        hoặc
        <span aria-hidden className="h-px flex-1 bg-border" />
      </div>
    </div>
  );
}

function GoogleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden xmlns="http://www.w3.org/2000/svg">
      <path
        d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
        fill="#34A853"
      />
      <path
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
        fill="#EA4335"
      />
    </svg>
  );
}
