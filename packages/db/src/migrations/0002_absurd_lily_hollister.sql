CREATE TABLE IF NOT EXISTS "chapter" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"story_id" uuid NOT NULL,
	"index" numeric(10, 2) NOT NULL,
	"title" text NOT NULL,
	"content_text" "bytea",
	"content_byte_size" integer,
	"source_id" text NOT NULL,
	"external_url" text NOT NULL,
	"crawled_at" timestamp with time zone,
	"status" "chapter_status" DEFAULT 'pending' NOT NULL,
	"last_error" text,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
DROP INDEX IF EXISTS "story_search_idx";--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chapter" ADD CONSTRAINT "chapter_story_id_story_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."story"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chapter" ADD CONSTRAINT "chapter_source_id_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "chapter_story_index_uniq" ON "chapter" USING btree ("story_id","index");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "story_search_idx" ON "story" USING gin (immutable_unaccent(lower("title" || ' ' || coalesce("author", ''))) gin_trgm_ops);