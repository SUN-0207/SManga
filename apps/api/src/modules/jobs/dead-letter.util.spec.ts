import { JOB_PRIORITY } from '@/modules/queue/queue.constants';
import { describe, expect, it } from 'vitest';
import { dedupKeyForJob, priorityForJob } from './dead-letter.util';

describe('dedupKeyForJob', () => {
  it('keys fetch-chapter by chapterId', () => {
    expect(dedupKeyForJob('fetch-chapter', { chapterId: 'c1' })).toBe('fetch-chapter:c1');
  });

  it('keys discover-chapters by storyId', () => {
    expect(dedupKeyForJob('discover-chapters', { storyId: 's1' })).toBe('discover-chapters:s1');
  });

  it('keys import-story by url', () => {
    expect(dedupKeyForJob('import-story', { url: 'https://x.test/a/' })).toBe(
      'import-story:https://x.test/a/',
    );
  });

  it('returns null for job types that must not be dead-lettered', () => {
    expect(dedupKeyForJob('discover-all-source', { sourceId: 's', feedId: 'f' })).toBeNull();
    expect(dedupKeyForJob('refresh-all-stories', {})).toBeNull();
    expect(dedupKeyForJob('retry-reconciler', {})).toBeNull();
    expect(dedupKeyForJob('unknown-job', {})).toBeNull();
  });

  it('returns null when the natural identifier is missing', () => {
    expect(dedupKeyForJob('fetch-chapter', {})).toBeNull();
    expect(dedupKeyForJob('fetch-chapter', undefined)).toBeNull();
  });
});

describe('priorityForJob', () => {
  it('returns the matching JOB_PRIORITY for dead-letterable jobs', () => {
    expect(priorityForJob('fetch-chapter')).toBe(JOB_PRIORITY.FETCH_CHAPTER);
    expect(priorityForJob('discover-chapters')).toBe(JOB_PRIORITY.DISCOVER_CHAPTERS);
    expect(priorityForJob('import-story')).toBe(JOB_PRIORITY.IMPORT_STORY);
  });

  it('returns undefined for everything else', () => {
    expect(priorityForJob('discover-all-source')).toBeUndefined();
  });
});
