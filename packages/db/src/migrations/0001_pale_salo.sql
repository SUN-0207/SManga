CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE OR REPLACE FUNCTION immutable_unaccent(text)
  RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS
$func$
SELECT public.unaccent('public.unaccent', $1)
$func$;

CREATE TABLE IF NOT EXISTS "genre" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "genre_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "story" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"author" text,
	"description" text DEFAULT '' NOT NULL,
	"cover" "bytea",
	"cover_mime_type" text,
	"status" "story_status" DEFAULT 'unknown' NOT NULL,
	"total_chapters" integer DEFAULT 0 NOT NULL,
	"last_chapter_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "story_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "story_genre" (
	"story_id" uuid NOT NULL,
	"genre_id" uuid NOT NULL,
	CONSTRAINT "story_genre_story_id_genre_id_pk" PRIMARY KEY("story_id","genre_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "story_source" (
	"story_id" uuid NOT NULL,
	"source_id" text NOT NULL,
	"external_id" text NOT NULL,
	"external_url" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"status" "story_source_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "story_source_story_id_source_id_pk" PRIMARY KEY("story_id","source_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "story_genre" ADD CONSTRAINT "story_genre_story_id_story_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."story"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "story_genre" ADD CONSTRAINT "story_genre_genre_id_genre_id_fk" FOREIGN KEY ("genre_id") REFERENCES "public"."genre"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "story_source" ADD CONSTRAINT "story_source_story_id_story_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."story"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "story_source" ADD CONSTRAINT "story_source_source_id_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "story_search_idx" ON "story" USING gin (immutable_unaccent(lower("title" || ' ' || coalesce("author", ''))) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "story_last_chapter_idx" ON "story" USING btree ("last_chapter_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "story_source_external_idx" ON "story_source" USING btree ("source_id","external_id");