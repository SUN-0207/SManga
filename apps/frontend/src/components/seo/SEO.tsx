import { Helmet } from 'react-helmet-async';
import { absoluteUrl } from './builders';

export interface SEOProps {
  title: string;
  description: string;
  canonical: string;
  robots?: 'index' | 'noindex' | 'noindex, follow';
  jsonLd?: object | object[];
  ogImage?: string;
  ogType?: 'website' | 'article' | 'book';
}

export function SEO({
  title,
  description,
  canonical,
  robots = 'index',
  jsonLd,
  ogImage = '/og-default.png',
  ogType = 'website',
}: SEOProps) {
  const url = absoluteUrl(canonical);
  const image = absoluteUrl(ogImage);
  const ldArray = jsonLd == null ? [] : Array.isArray(jsonLd) ? jsonLd : [jsonLd];

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta name="robots" content={robots} />
      <link rel="canonical" href={url} />

      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:image" content={image} />
      <meta property="og:type" content={ogType} />
      <meta property="og:locale" content="vi_VN" />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />

      {ldArray.map((ld, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: stable order, length doesn't change after mount
        <script key={i} type="application/ld+json">
          {JSON.stringify(ld)}
        </script>
      ))}
    </Helmet>
  );
}
