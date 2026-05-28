CREATE TYPE "public"."chapter_status" AS ENUM('pending', 'crawled', 'failed');--> statement-breakpoint
CREATE TYPE "public"."story_source_status" AS ENUM('active', 'unavailable');--> statement-breakpoint
CREATE TYPE "public"."story_status" AS ENUM('ongoing', 'completed', 'dropped', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "source" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"base_url" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"rate_limit_rps" numeric(6, 2) DEFAULT '1' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
