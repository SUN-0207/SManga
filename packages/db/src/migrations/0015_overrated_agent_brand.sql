ALTER TABLE "story" ADD COLUMN "last_notified_chapter_index" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "app_setting" ADD COLUMN "new_chapter_notify_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "story_id" uuid;--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "chapter_index" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "new_count" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_story_id_story_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."story"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_new_chapter_unread_uniq" ON "notification" USING btree ("user_id","story_id") WHERE type = 'new_chapter' AND read_at IS NULL;
--> statement-breakpoint
UPDATE "story" s SET "last_notified_chapter_index" = sub.max_idx
FROM (
  SELECT story_id, max(index) AS max_idx
  FROM "chapter" WHERE status = 'crawled' GROUP BY story_id
) sub
WHERE s.id = sub.story_id;