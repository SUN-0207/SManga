import type { SourceAdapter } from '@smanga/shared';
import { AdapterNotFoundError } from '@smanga/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  _resetForTests,
  getAdapter,
  registerAdapter,
  resolveAdapterForUrl,
} from '../src/registry.js';

const stub: SourceAdapter = {
  id: 'stub',
  name: 'Stub',
  baseUrl: 'https://stub.test',
  hostnames: ['stub.test', 'www.stub.test'],
  requiresJs: false,
  rateLimit: { rps: 1 },
  parseStoryFromUrl: async () => ({
    externalId: 'x',
    title: 'x',
    author: null,
    description: '',
    coverUrl: null,
    genres: [],
    status: 'unknown',
  }),
  listChapters: async () => ({ chapters: [], hasNextPage: false }),
  fetchChapterContent: async () => ({ title: '', text: 'x' }),
  buildListChaptersUrl: (u) => u,
  catalogFeeds: [],
  buildCatalogUrl: () => 'https://stub.test/catalog',
  parseCatalogPage: async () => ({ items: [], page: 1, hasNextPage: false }),
};

describe('registry', () => {
  beforeEach(() => _resetForTests());

  it('returns adapter by id', () => {
    registerAdapter(stub);
    expect(getAdapter('stub').id).toBe('stub');
  });

  it('throws when adapter id unknown', () => {
    expect(() => getAdapter('missing')).toThrow(AdapterNotFoundError);
  });

  it('resolves adapter by URL hostname', () => {
    registerAdapter(stub);
    expect(resolveAdapterForUrl('https://www.stub.test/abc').id).toBe('stub');
  });

  it('throws when hostname unknown', () => {
    registerAdapter(stub);
    expect(() => resolveAdapterForUrl('https://other.test')).toThrow(AdapterNotFoundError);
  });
});
