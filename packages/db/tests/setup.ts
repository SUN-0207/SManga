import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { afterAll, beforeAll } from 'vitest';

let container: StartedPostgreSqlContainer;
let sql: ReturnType<typeof postgres>;

export let db: ReturnType<typeof drizzle>;

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine').start();
  sql = postgres(container.getConnectionUri(), { max: 1 });
  db = drizzle(sql);
  await migrate(db, { migrationsFolder: './src/migrations' });
}, 60_000);

afterAll(async () => {
  await sql?.end();
  await container?.stop();
});
