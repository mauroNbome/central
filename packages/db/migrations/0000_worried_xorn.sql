CREATE SCHEMA "loops";
--> statement-breakpoint
CREATE TYPE "loops"."loop_horizon" AS ENUM('today', 'week', 'later');--> statement-breakpoint
CREATE TYPE "loops"."loop_source" AS ENUM('web', 'pwa', 'voice', 'bot', 'mcp');--> statement-breakpoint
CREATE TYPE "loops"."loop_status" AS ENUM('inbox', 'active', 'someday', 'done', 'dropped');--> statement-breakpoint
CREATE TYPE "loops"."step_status" AS ENUM('pending', 'done');--> statement-breakpoint
CREATE TABLE "loops"."areas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loops"."contexts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"icon" text NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loops"."loops" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"raw_text" text NOT NULL,
	"status" "loops"."loop_status" DEFAULT 'inbox' NOT NULL,
	"area_id" uuid,
	"horizon" "loops"."loop_horizon",
	"source" "loops"."loop_source" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "loops_horizon_iff_active" CHECK (("loops"."loops"."status" = 'active') = ("loops"."loops"."horizon" is not null))
);
--> statement-breakpoint
CREATE TABLE "loops"."steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"loop_id" uuid NOT NULL,
	"title" text NOT NULL,
	"position" integer NOT NULL,
	"context_id" uuid,
	"status" "loops"."step_status" DEFAULT 'pending' NOT NULL,
	"estimate_minutes" integer,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "loops"."loops" ADD CONSTRAINT "loops_area_id_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "loops"."areas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loops"."steps" ADD CONSTRAINT "steps_loop_id_loops_id_fk" FOREIGN KEY ("loop_id") REFERENCES "loops"."loops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loops"."steps" ADD CONSTRAINT "steps_context_id_contexts_id_fk" FOREIGN KEY ("context_id") REFERENCES "loops"."contexts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "loops_user_status_idx" ON "loops"."loops" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "steps_loop_position_idx" ON "loops"."steps" USING btree ("loop_id","position");