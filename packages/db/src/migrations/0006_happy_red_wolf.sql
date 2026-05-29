CREATE TYPE "public"."story_discovery_status" AS ENUM('pending', 'running', 'complete', 'failed');--> statement-breakpoint
ALTER TABLE "story" ADD COLUMN "discovery_status" "story_discovery_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "story" ADD COLUMN "discovery_error" text;--> statement-breakpoint
ALTER TABLE "story" ADD COLUMN "discovered_at" timestamp with time zone;--> statement-breakpoint
-- Backfill: stories already imported under the old single-job flow have
-- chapter rows -> mark them 'complete' so the frontend doesn't treat them
-- as stubs. New imports default to 'pending' and run through the 2-step flow.
UPDATE "story" SET "discovery_status" = 'complete', "discovered_at" = "updated_at"
  WHERE "total_chapters" > 0;