// Áreas y contextos por defecto para el usuario único. Se puede correr varias veces.
import { createDb } from "@hub/db";
import { seedDefaults } from "@hub/loops/server";
import { requireEnv } from "./env.ts";

const { db, close } = createDb(requireEnv("DATABASE_URL"));
await seedDefaults(db, requireEnv("HUB_USER_ID"));
await close();
console.log("seed: áreas y contextos listos");
