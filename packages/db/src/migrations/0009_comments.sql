-- pgcrypto (gen_random_uuid) already enabled in migration 0001.
-- Enum must be created BEFORE the table that references it.

-- Postgres does NOT support `CREATE TYPE IF NOT EXISTS`. The DO-block guard
-- below catches the duplicate_object exception so this migration is safe to
-- re-run against a DB that already has the enum.
DO $$ BEGIN
  CREATE TYPE comment_target_type AS ENUM ('story', 'chapter');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "comment" (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  target_type  comment_target_type NOT NULL,
  target_id    uuid NOT NULL,
  parent_id    uuid REFERENCES "comment"(id) ON DELETE CASCADE,
  depth        smallint NOT NULL DEFAULT 1 CHECK (depth BETWEEN 1 AND 3),
  body         text NOT NULL,
  edited_at    timestamptz,
  deleted_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- target_id is intentionally NOT a FK (polymorphic — points to either story or chapter).
-- Service layer validates existence via SELECT before INSERT.

CREATE INDEX IF NOT EXISTS comment_target_idx ON "comment" (target_type, target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS comment_parent_idx ON "comment" (parent_id);
CREATE INDEX IF NOT EXISTS comment_user_idx   ON "comment" (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS "comment_reaction" (
  comment_id uuid NOT NULL REFERENCES "comment"(id) ON DELETE CASCADE,
  user_id    text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  type       text NOT NULL DEFAULT 'like',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, user_id, type)
);

CREATE TABLE IF NOT EXISTS "notification" (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  type              text NOT NULL,
  source_comment_id uuid REFERENCES "comment"(id) ON DELETE CASCADE,
  actor_user_id     text REFERENCES "user"(id) ON DELETE SET NULL,
  read_at           timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- Partial index: only unread rows. Drizzle does not generate this; it lives in raw SQL only.
CREATE INDEX IF NOT EXISTS notification_user_unread_idx ON "notification" (user_id, created_at DESC)
  WHERE read_at IS NULL;
