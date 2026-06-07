// Daily probe against the live truyenfull.today site to catch breaking
// HTML changes BEFORE end-users see broken parsers. Invoked by the
// .github/workflows/crawler-health-probe.yml cron at 20:00 UTC daily.
//
// Exits 1 on any parsing failure so the workflow flips red + files an issue.
import { fetchHtml, getAdapter } from '@smanga/crawler';

const errors: string[] = [];

async function check(name: string, fn: () => Promise<string>): Promise<void> {
  try {
    const detail = await fn();
    console.log(`  ✓ ${name}: ${detail}`);
  } catch (e) {
    const msg = (e as Error).message;
    console.error(`  ✗ ${name}: ${msg}`);
    errors.push(`${name}: ${msg}`);
  }
}

const adapter = getAdapter('truyenfull');

// 1. Catalog feed parse — first declared feed, page 1
await check('catalog', async () => {
  const feed = adapter.catalogFeeds[0];
  if (!feed) throw new Error('no catalog feeds declared');
  const url = adapter.buildCatalogUrl(feed.id, 1);
  const html = await fetchHtml(url);
  const page = await adapter.parseCatalogPage(html, feed.id, 1);
  if (page.items.length < 5) {
    throw new Error(`only ${page.items.length} items in catalog page 1 (expect >=5)`);
  }
  return `${page.items.length} items, hasNextPage=${page.hasNextPage}`;
});

// 2. Known popular story — should never go away.
// Note: truyenfull changed URL pattern from /<slug>/ to /truyen-<slug>/
// in mid-2026. Use the current pattern; the old one 301-redirects but the
// fetched HTML is the new layout that the parser already handles.
const STORY_URL = 'https://truyenfull.today/truyen-dau-pha-thuong-khung/';
await check('story metadata', async () => {
  const html = await fetchHtml(STORY_URL);
  const meta = await adapter.parseStoryFromUrl(STORY_URL, html);
  if (!meta.title) throw new Error('no title parsed');
  if (!meta.author) throw new Error('no author parsed');
  return `${meta.title} / ${meta.author}`;
});

// 3. Chapter list parse — page 1 of the same story
await check('chapter list', async () => {
  const url = adapter.buildListChaptersUrl(STORY_URL, 1);
  const html = await fetchHtml(url);
  const list = await adapter.listChapters(html);
  if (list.chapters.length < 30) {
    throw new Error(`only ${list.chapters.length} chapters on page 1 (expect >=30)`);
  }
  return `${list.chapters.length} chapters, hasNextPage=${list.hasNextPage}`;
});

if (errors.length > 0) {
  console.error('');
  console.error('PROBE FAILED — truyenfull.today HTML likely changed:');
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log('');
console.log('PROBE OK');
