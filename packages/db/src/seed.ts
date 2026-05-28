import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { source } from './schema/index.js';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');

const sql = postgres(url, { max: 1 });
const db = drizzle(sql);

await db
  .insert(source)
  .values({
    id: 'truyenfull',
    name: 'TruyenFull',
    baseUrl: 'https://truyenfull.today',
    rateLimitRps: '1',
  })
  .onConflictDoNothing();

await sql.end();
console.log('seed complete');
