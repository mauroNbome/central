import { sql } from "drizzle-orm";
import { check, index, integer, pgSchema, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Todo el módulo vive en el schema de Postgres "loops". Ningún otro módulo
// lee ni escribe estas tablas: para eso está contract.ts.
export const loopsSchema = pgSchema("loops");

export const loopStatusEnum = loopsSchema.enum("loop_status", ["inbox", "active", "someday", "done", "dropped"]);
export const loopHorizonEnum = loopsSchema.enum("loop_horizon", ["today", "week", "later"]);
export const loopSourceEnum = loopsSchema.enum("loop_source", ["web", "pwa", "voice", "bot", "mcp"]);
export const stepStatusEnum = loopsSchema.enum("step_status", ["pending", "done"]);

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const areas = loopsSchema.table("areas", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  name: text("name").notNull(),
  color: text("color").notNull(),
  position: integer("position").notNull(),
});

export const contexts = loopsSchema.table("contexts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  name: text("name").notNull(),
  icon: text("icon").notNull(),
  position: integer("position").notNull(),
});

export const loops = loopsSchema.table(
  "loops",
  {
    // Sin default: el id lo genera el cliente (ver captureLoopInput en contract.ts).
    id: uuid("id").primaryKey(),
    userId: uuid("user_id").notNull(),
    title: text("title").notNull(),
    rawText: text("raw_text").notNull(),
    status: loopStatusEnum("status").notNull().default("inbox"),
    areaId: uuid("area_id").references(() => areas.id, { onDelete: "set null" }),
    horizon: loopHorizonEnum("horizon"),
    source: loopSourceEnum("source").notNull(),
    createdAt: createdAt(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("loops_user_status_idx").on(t.userId, t.status),
    // Un loop activo siempre tiene horizonte, y sólo los activos lo tienen.
    check("loops_horizon_iff_active", sql`(${t.status} = 'active') = (${t.horizon} is not null)`),
  ],
);

export const steps = loopsSchema.table(
  "steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    loopId: uuid("loop_id")
      .notNull()
      .references(() => loops.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    position: integer("position").notNull(),
    contextId: uuid("context_id").references(() => contexts.id, { onDelete: "set null" }),
    status: stepStatusEnum("status").notNull().default("pending"),
    estimateMinutes: integer("estimate_minutes"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("steps_loop_position_idx").on(t.loopId, t.position)],
);
