CREATE INDEX "story_view_count_idx" ON "story" USING btree ("view_count" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "story_genre_genre_id_idx" ON "story_genre" USING btree ("genre_id");--> statement-breakpoint
CREATE INDEX "reading_progress_updated_at_idx" ON "reading_progress" USING btree ("updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "notification_user_created_idx" ON "notification" USING btree ("user_id","created_at" DESC NULLS LAST);