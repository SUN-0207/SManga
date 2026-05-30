-- Per-story opt-out for scheduled auto-refresh (default true).
ALTER TABLE "story" ADD COLUMN "auto_refresh" boolean NOT NULL DEFAULT true;--> statement-breakpoint

-- Singleton app settings row holding the scheduled auto-refresh policy.
CREATE TABLE "app_setting" (
  "id" integer PRIMARY KEY DEFAULT 1 CHECK ("id" = 1),
  "auto_refresh_enabled" boolean NOT NULL DEFAULT false,
  "auto_refresh_cron" text NOT NULL DEFAULT '0 2 * * *',
  "auto_refresh_scope" text NOT NULL DEFAULT 'ongoing',
  "auto_refresh_concurrency" integer NOT NULL DEFAULT 5,
  "last_run_at" timestamp with time zone,
  "last_run_count" integer,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);--> statement-breakpoint

-- Seed the single row so the service can always SELECT/UPDATE without insert path.
INSERT INTO "app_setting" ("id") VALUES (1) ON CONFLICT DO NOTHING;
