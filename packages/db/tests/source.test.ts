import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { source } from '../src/schema/index.js';
import { db } from './setup.js';

describe('source schema', () => {
  it('inserts and reads a source row', async () => {
    await db.insert(source).values({
      id: 'truyenfull',
      name: 'TruyenFull',
      baseUrl: 'https://truyenfull.today',
    });

    const rows = await db.select().from(source).where(eq(source.id, 'truyenfull'));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe('TruyenFull');
    expect(rows[0]?.isActive).toBe(true);
    expect(rows[0]?.rateLimitRps).toBe('1.00');
  });
});
