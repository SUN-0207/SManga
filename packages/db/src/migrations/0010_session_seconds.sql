ALTER TABLE "reading_progress" ADD COLUMN IF NOT EXISTS "session_seconds" integer NOT NULL DEFAULT 0;
