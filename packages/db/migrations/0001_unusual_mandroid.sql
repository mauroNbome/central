ALTER TABLE "loops"."loops" ADD COLUMN "last_activity_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
-- Backfill a mano: sin esto, todos los loops existentes arrancan "recién tocados".
-- updated_at es el mejor dato disponible (incluye reprogramaciones, que ya no cuentan).
UPDATE "loops"."loops" SET "last_activity_at" = "updated_at";
