import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.ts';

export type Database = ReturnType<typeof createDb>;

export function createDb(connectionString: string, max = 10) {
  const queryClient = postgres(connectionString, { max });
  return drizzle(queryClient, { schema });
}
