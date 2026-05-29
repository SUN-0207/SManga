ALTER TABLE "bookmark" ALTER COLUMN "story_id" SET DATA TYPE uuid USING "story_id"::uuid;--> statement-breakpoint
ALTER TABLE "reading_progress" ALTER COLUMN "story_id" SET DATA TYPE uuid USING "story_id"::uuid;
