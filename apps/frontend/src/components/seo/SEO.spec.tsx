import { HelmetProvider } from '@dr.pogodin/react-helmet';
import { render, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SEO } from './SEO';

function renderWithProvider(node: React.ReactNode) {
  return render(<HelmetProvider>{node}</HelmetProvider>);
}

describe('<SEO>', () => {
  it('sets document.title from props', async () => {
    renderWithProvider(<SEO title="Test Title" description="Test desc" canonical="/x" />);
    await waitFor(() => expect(document.title).toBe('Test Title'));
  });

  it('injects meta description', async () => {
    renderWithProvider(<SEO title="T" description="My description here" canonical="/x" />);
    await waitFor(() => {
      const meta = document.querySelector('meta[name="description"]');
      expect(meta?.getAttribute('content')).toBe('My description here');
    });
  });

  it('injects canonical link as absolute URL', async () => {
    renderWithProvider(<SEO title="T" description="D" canonical="/foo" />);
    await waitFor(() => {
      const link = document.querySelector('link[rel="canonical"]');
      expect(link?.getAttribute('href')).toBe('https://smanga.shop/foo');
    });
  });

  it('renders JSON-LD script when jsonLd prop provided', async () => {
    const ld = { '@context': 'https://schema.org', '@type': 'WebSite' };
    renderWithProvider(<SEO title="T" description="D" canonical="/x" jsonLd={ld} />);
    await waitFor(() => {
      const script = document.querySelector('script[type="application/ld+json"]');
      expect(script).not.toBeNull();
      expect(JSON.parse(script?.textContent ?? '{}')).toEqual(ld);
    });
  });

  it('sets robots meta from prop', async () => {
    renderWithProvider(<SEO title="T" description="D" canonical="/x" robots="noindex" />);
    await waitFor(() => {
      const meta = document.querySelector('meta[name="robots"]');
      expect(meta?.getAttribute('content')).toBe('noindex');
    });
  });

  it('defaults robots to "index" when prop omitted', async () => {
    renderWithProvider(<SEO title="T" description="D" canonical="/x" />);
    await waitFor(() => {
      const meta = document.querySelector('meta[name="robots"]');
      expect(meta?.getAttribute('content')).toBe('index');
    });
  });
});
