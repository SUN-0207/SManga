CREATE TABLE IF NOT EXISTS "app_setting" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"auto_refresh_enabled" boolean DEFAULT false NOT NULL,
	"auto_refresh_cron" text DEFAULT '0 2 * * *' NOT NULL,
	"auto_refresh_scope" text DEFAULT 'ongoing' NOT NULL,
	"auto_refresh_concurrency" integer DEFAULT 5 NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_run_count" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rating" (
	"user_id" text NOT NULL,
	"story_id" uuid NOT NULL,
	"value" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rating_user_id_story_id_pk" PRIMARY KEY("user_id","story_id"),
	CONSTRAINT "rating_value_range" CHECK ("rating"."value" BETWEEN 1 AND 5)
);
--> statement-breakpoint
ALTER TABLE "story" ADD COLUMN IF NOT EXISTS "auto_refresh" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "story" ADD COLUMN IF NOT EXISTS "view_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "chapter" ADD COLUMN IF NOT EXISTS "view_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rating" ADD CONSTRAINT "rating_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rating" ADD CONSTRAINT "rating_story_id_story_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."story"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rating_story_idx" ON "rating" USING btree ("story_id");