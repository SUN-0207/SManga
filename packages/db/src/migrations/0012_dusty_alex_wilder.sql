CREATE TYPE "public"."job_failure_class" AS ENUM('transient', 'permanent');--> statement-breakpoint
CREATE TYPE "public"."job_failure_status" AS ENUM('pending', 'retrying', 'needs_attention', 'dead', 'resolved');--> statement-breakpoint
CREATE TABLE "job_failure" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dedup_key" text NOT NULL,
	"queue" text DEFAULT 'crawler' NOT NULL,
	"job_name" text NOT NULL,
	"job_data" jsonb NOT NULL,
	"error_class" text NOT NULL,
	"classification" "job_failure_class" NOT NULL,
	"failed_reason" text,
	"attempts_made" integer DEFAULT 0 NOT NULL,
	"retry_generation" integer DEFAULT 0 NOT NULL,
	"status" "job_failure_status" NOT NULL,
	"first_failed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_failed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"next_retry_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_setting" ADD COLUMN "auto_retry_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "job_failure_dedup_key_unique" ON "job_failure" USING btree ("dedup_key");--> statement-breakpoint
CREATE INDEX "job_failure_reconciler_idx" ON "job_failure" USING btree ("status","next_retry_at");