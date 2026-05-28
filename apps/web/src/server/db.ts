import { createDb, type Database } from '@smanga/db';
import { env } from '@/lib/env';

let cached: Database | null = null;

export function getDb(): Database {
  if (!cached) {
    cached = createDb(env.DATABASE_URL);
  }
  return cached;
}
