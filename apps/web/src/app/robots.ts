import type { MetadataRoute } from 'next';
import { env } from '@/lib/env';

export default function robots(): MetadataRoute.Robots {
  const base = env.NEXT_PUBLIC_BASE_URL.replace(/\/$/, '');
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin/', '/api/', '/dang-nhap'],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
