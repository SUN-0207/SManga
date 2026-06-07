import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');

// Diagnostic: print host + db name (NOT password) so logs reveal which
// Postgres host/db we actually connected to. Helps catch wrong-secret issues.
try {
  const parsed = new URL(url);
  console.log(`→ Connecting to ${parsed.hostname}${parsed.pathname}`);
} catch {
  console.log('→ Connecting (could not parse DATABASE_URL)');
}

const sql = postgres(url, { max: 1 });
const db = drizzle(sql);

await migrate(db, { migrationsFolder: './src/migrations' });

// Diagnostic: report the applied-migrations journal so CI logs show what
// Drizzle thinks is on the DB AFTER the migrate call. If 0009..0011 are
// here but the corresponding tables aren't visible to the app, you are
// pointed at the wrong DB.
const applied = await sql<{ hash: string; created_at: string }[]>`
  SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id DESC LIMIT 15
`;
console.log(`→ Last ${applied.length} applied migrations on this DB:`);
for (const row of applied) {
  console.log(`  ${row.created_at} ${row.hash.slice(0, 12)}`);
}

// Also verify the schema actually has the columns the new code expects.
// If __drizzle_migrations shows 0009-0011 hashes but these queries return
// zero rows, the migration journal is OUT OF SYNC with the real schema
// (the migrator marked them done but the DDL didn't actually apply).
const hasFeatured = await sql<{ exists: boolean }[]>`
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'story' AND column_name = 'featured'
  ) AS exists
`;
const hasCommentTable = await sql<{ exists: boolean }[]>`
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'comment'
  ) AS exists
`;
const hasSessionSeconds = await sql<{ exists: boolean }[]>`
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'reading_progress' AND column_name = 'session_seconds'
  ) AS exists
`;
console.log('→ Schema check:');
console.log(`  story.featured           : ${hasFeatured[0]?.exists ? 'OK' : 'MISSING'}`);
console.log(`  comment table            : ${hasCommentTable[0]?.exists ? 'OK' : 'MISSING'}`);
console.log(
  `  reading_progress.session_seconds : ${hasSessionSeconds[0]?.exists ? 'OK' : 'MISSING'}`,
);

await sql.end();
console.log('migrations applied');
