CREATE TYPE "public"."report_category" AS ENUM('content', 'comment', 'technical', 'other');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('open', 'in_progress', 'resolved', 'dismissed');--> statement-breakpoint
CREATE TABLE "report" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"category" "report_category" NOT NULL,
	"message" text NOT NULL,
	"story_id" uuid,
	"chapter_id" uuid,
	"status" "report_status" DEFAULT 'open' NOT NULL,
	"admin_note" text,
	"resolved_by_user_id" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_story_id_story_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."story"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_chapter_id_chapter_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapter"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_resolved_by_user_id_user_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "report_status_created_idx" ON "report" USING btree ("status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "report_user_idx" ON "report" USING btree ("user_id");