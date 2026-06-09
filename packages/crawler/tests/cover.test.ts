import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchBytesMock = vi.fn();
vi.mock('../src/fetcher.ts', () => ({
  fetchBytes: (...args: unknown[]) => fetchBytesMock(...args),
}));

import { downloadCover } from '../src/cover.ts';

describe('downloadCover', () => {
  beforeEach(() => {
    fetchBytesMock.mockReset();
  });

  it('accepts standard image/jpeg', async () => {
    fetchBytesMock.mockResolvedValue({
      bytes: Buffer.from([0xff, 0xd8, 0xff]),
      contentType: 'image/jpeg',
    });
    const result = await downloadCover('https://x.test/a.jpg');
    expect(result).not.toBeNull();
    expect(result?.mimeType).toBe('image/jpeg');
  });

  it("normalises truyenfull's non-standard 'image/jpg' to image/jpeg", async () => {
    fetchBytesMock.mockResolvedValue({
      bytes: Buffer.from([0xff, 0xd8, 0xff]),
      contentType: 'image/jpg',
    });
    const result = await downloadCover('https://static.truyenfull.today/x.jpg');
    expect(result).not.toBeNull();
    expect(result?.mimeType).toBe('image/jpeg');
  });

  it('strips charset parameters before mime check', async () => {
    fetchBytesMock.mockResolvedValue({
      bytes: Buffer.from([0xff, 0xd8, 0xff]),
      contentType: 'image/jpeg; charset=binary',
    });
    const result = await downloadCover('https://x.test/a.jpg');
    expect(result?.mimeType).toBe('image/jpeg');
  });

  it('rejects non-image content-types', async () => {
    fetchBytesMock.mockResolvedValue({
      bytes: Buffer.from('<html>'),
      contentType: 'text/html',
    });
    expect(await downloadCover('https://x.test/a.jpg')).toBeNull();
  });

  it('returns null when fetch throws', async () => {
    fetchBytesMock.mockRejectedValue(new Error('boom'));
    expect(await downloadCover('https://x.test/a.jpg')).toBeNull();
  });
});
