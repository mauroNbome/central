# Estado

> Se **reescribe** al cerrar cada sesión, no se le agrega. Foto del proyecto hoy.
> Última actualización: 2026-10-15

## Dónde estamos

Monorepo andando (pnpm 11 + Turborepo + TS 7), en GitHub: `mauroNbome/central`.
Backend de captura y procesado completo: dominio puro, repositorio Drizzle,
servicio con transacciones y eventos post-commit, y rutas Hono montadas en la api.
La web todavía es un placeholder: **no hay UI real**.

### Fase 1 — MVP Loops

| Ítem | Estado |
|---|---|
| Monorepo inicializado (estructura de `CLAUDE.md`) | ✅ |
| Captura rápida web + PWA, offline, atajo de teclado | 🟡 api lista (`POST /api/loops`, idempotente); falta UI, cola offline y PWA |
| Inbox con procesado por teclado | 🟡 api lista (`GET /api/loops?status=inbox`, `POST /api/loops/:id/process`); falta UI |
| Editor de pasos: agregar, reordenar, contexto | ⬜ |
| Vista Hoy: próximas acciones + filtro por contexto | ⬜ dominio listo (`nextAction`) |
| Completar paso promueve el siguiente; el último cierra el loop | ⬜ dominio listo (`completeStep`); falta api + UI |
| Vista Loops filtrable por estado y área | ⬜ |

Criterio de salida: 2 semanas de uso diario antes de la Fase 2.

## Cómo verificar

```bash
pnpm install
pnpm db:up && pnpm db:migrate && pnpm db:seed
pnpm typecheck          # 7 paquetes
pnpm test               # core 3 + loops 19 (dominio) + api 9 (integración, necesita Postgres)
pnpm dev                # api :3001, web :5173 (proxy /api → api)
```

Cambio de schema: editar `modules/<m>/server/schema.ts` → `pnpm db:generate` → revisar el SQL → `pnpm db:migrate`.

## Qué sigue

1. **Captura en la web**: un input y Enter, con el cliente `hc` (importar `AppType` de `apps/api/src/app.ts` como tipo) y TanStack Query optimista. El id se genera con `crypto.randomUUID()` en el cliente.
2. **Inbox con procesado por teclado**: una tecla por decisión (Hoy / Semana / Más adelante / Algún día / Hecho / Descartar).
3. Después: cola offline en IndexedDB + PWA; rutas de pasos (crear, reordenar, completar).

## Pendiente de decidir

- **¿Herramienta personal o producto?** Define auth, multi-tenancy, hosting y onboarding.
  Hasta decidirlo: single-user con `HUB_USER_ID` fijo en `.env`.
- Hosting y proveedor de Postgres (en dev: Docker local).

## Trampas conocidas

- Postgres del hub en el **5433** (`hub_db`): el 5432 lo ocupa `conserje_db`.
- Los tests de la api usan la base de dev con usuarios aleatorios: en `loops.*` hay filas de prueba de otros `user_id`. Es esperable.
- pnpm 11 bloquea los postinstall: una dependencia nueva con build hay que habilitarla en `allowBuilds` (`pnpm-workspace.yaml`).
- TS 7 (nativo) no expone la API JS de TypeScript: si alguna herramienta la necesita (p. ej. typescript-eslint), bajar esa herramienta o usar TS 6 para ella.
- Un módulo nuevo con schema de Postgres propio hay que sumarlo a `schemaFilter` en `packages/db/drizzle.config.ts`, o drizzle-kit lo ignora.
- Para matar procesos desde la shell de Claude, **ni `pkill -f` ni `pgrep -f`**: el patrón matchea la propia shell y la mata. Usar `ps -eo pid,args | grep "[t]sx"` y `kill <pid>`.
