import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { chapter } from '../src/schema/chapter.js';
import { story } from '../src/schema/story.js';

describe('perf indexes (spec 2026-06-11 §3.2)', () => {
  it('story has the updated_at top-N index', () => {
    const names = getTableConfig(story).indexes.map((i) => i.config.name);
    expect(names).toContain('story_updated_at_idx');
  });

  it('chapter has the partial needs-crawl index with a WHERE clause', () => {
    const idx = getTableConfig(chapter).indexes.find(
      (i) => i.config.name === 'chapter_needs_crawl_idx',
    );
    expect(idx).toBeDefined();
    expect(idx?.config.where).toBeDefined(); // partial index
  });
});
