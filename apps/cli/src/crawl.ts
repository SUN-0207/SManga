import process from 'node:process';
import { createDb } from '@smanga/db';
import { fetchAllPendingChapters, importStory } from '@smanga/crawler';

function parseArgs(argv: string[]): { url: string; chapters: boolean } {
  const args = argv.slice(2);
  let url: string | undefined;
  let chapters = false;
  for (const a of args) {
    if (a === '--chapters' || a === '--all-chapters') chapters = true;
    else if (!a.startsWith('-')) url = a;
  }
  if (!url) {
    console.error('usage: pnpm crawl <story-url> [--chapters]');
    process.exit(1);
  }
  return { url, chapters };
}

const { url, chapters } = parseArgs(process.argv);
const connection = process.env.DATABASE_URL;
if (!connection) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const db = createDb(connection);

const result = await importStory(db, url);
console.log(`imported story ${result.storyId} with ${result.totalChapters} chapters`);

if (chapters) {
  console.log('fetching chapter content...');
  const { done, failed } = await fetchAllPendingChapters(db, result.storyId);
  console.log(`chapters: ${done} crawled, ${failed} failed`);
}

process.exit(0);
