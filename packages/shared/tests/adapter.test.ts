import { describe, expect, it } from 'vitest';
import { storyMetadataSchema } from '../src/adapter.js';

describe('storyMetadataSchema', () => {
  it('accepts a complete metadata payload', () => {
    expect(() =>
      storyMetadataSchema.parse({
        externalId: 'tieu-thuyet-test',
        title: 'Tiểu thuyết test',
        author: 'Tác giả X',
        description: 'mô tả',
        coverUrl: 'https://x.test/cover.jpg',
        genres: ['Tiên Hiệp', 'Huyền Huyễn'],
        status: 'ongoing',
      }),
    ).not.toThrow();
  });

  it('rejects missing title', () => {
    expect(() =>
      storyMetadataSchema.parse({
        externalId: 'x',
        title: '',
        author: null,
        description: '',
        coverUrl: null,
        genres: [],
        status: 'unknown',
      }),
    ).toThrow();
  });
});
