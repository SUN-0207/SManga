CREATE TABLE "chapter_read_award" (
	"user_id" text NOT NULL,
	"story_id" uuid NOT NULL,
	"chapter_index_int" integer NOT NULL,
	"dwell_seconds" integer DEFAULT 0 NOT NULL,
	"rewarded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chapter_read_award_user_id_story_id_chapter_index_int_pk" PRIMARY KEY("user_id","story_id","chapter_index_int")
);
--> statement-breakpoint
CREATE TABLE "reward_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"source" text NOT NULL,
	"currency" text NOT NULL,
	"amount" bigint NOT NULL,
	"balance_after" bigint NOT NULL,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_cultivation" (
	"user_id" text PRIMARY KEY NOT NULL,
	"xp" bigint DEFAULT 0 NOT NULL,
	"linh_thach" bigint DEFAULT 0 NOT NULL,
	"tien_ngoc" bigint DEFAULT 0 NOT NULL,
	"checkin_streak" integer DEFAULT 0 NOT NULL,
	"last_checkin_date" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_setting" ADD COLUMN "gamification_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "chapter_read_award" ADD CONSTRAINT "chapter_read_award_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_ledger" ADD CONSTRAINT "reward_ledger_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_cultivation" ADD CONSTRAINT "user_cultivation_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reward_ledger_user_created_idx" ON "reward_ledger" USING btree ("user_id","created_at" DESC NULLS LAST);