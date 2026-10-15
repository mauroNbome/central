import { defineConfig } from "drizzle-kit";

process.loadEnvFile("../../.env");

// Cada módulo es dueño de su schema (loops.*, agenda.*, …) y lo define en
// modules/<módulo>/server/schema.ts. Las migraciones son una sola secuencia
// para todo el hub: así hay un único orden de aplicación y una sola tabla de control.
export default defineConfig({
  dialect: "postgresql",
  schema: "../../modules/*/server/schema.ts",
  out: "./migrations",
  schemaFilter: ["loops"],
  dbCredentials: { url: process.env.DATABASE_URL! },
});
