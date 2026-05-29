import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '..', 'src', 'migrations');

let container: StartedPostgreSqlContainer;
let sql: ReturnType<typeof postgres>;

export let db: ReturnType<typeof drizzle>;

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine').start();
  sql = postgres(container.getConnectionUri(), { max: 1 });
  db = drizzle(sql);
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
}, 60_000);

afterAll(async () => {
  await sql?.end();
  await container?.stop();
});
