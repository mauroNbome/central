# Estado

> Se **reescribe** al cerrar cada sesión, no se le agrega. Foto del proyecto hoy.
> Última actualización: 2026-10-15

## Dónde estamos

Monorepo inicializado (pnpm 11 + Turborepo + TS 7). Dominio de Loops escrito y
testeado. Schema `loops.*` migrado. La api responde `/api/health` y la web
muestra una pantalla placeholder. Todavía no hay rutas de loops ni UI real.

### Fase 1 — MVP Loops

| Ítem | Estado |
|---|---|
| Monorepo inicializado (estructura de `CLAUDE.md`) | ✅ |
| Captura rápida web + PWA, offline, atajo de teclado | ⬜ |
| Inbox con procesado por teclado | ⬜ dominio listo (`processLoop`), falta api + UI |
| Editor de pasos: agregar, reordenar, contexto | ⬜ |
| Vista Hoy: próximas acciones + filtro por contexto | ⬜ dominio listo (`nextAction`) |
| Completar paso promueve el siguiente; el último cierra el loop | ⬜ dominio listo (`completeStep`), falta api + UI |
| Vista Loops filtrable por estado y área | ⬜ |

Criterio de salida: 2 semanas de uso diario antes de la Fase 2.

## Cómo verificar

```bash
pnpm install
pnpm typecheck          # 7 paquetes
pnpm test               # core (bus) + loops (dominio)
pnpm db:up && pnpm db:migrate
pnpm dev                # api :3001, web :5173 (proxy /api → api)
curl localhost:5173/api/health   # {"ok":true}
```

Cambio de schema: editar `modules/<m>/server/schema.ts` → `pnpm db:generate` → revisar el SQL → `pnpm db:migrate`.

## Qué sigue

1. **Repositorio + rutas de Loops** en `modules/loops/server`: capturar (idempotente por id), listar inbox y procesar. Montarlas en `apps/api` y emitir eventos tras el commit.
2. Usuario único: constante `DEFAULT_USER_ID` y seed de áreas (SELL, BUILD, SHARE, Hogar) y contextos (Calle, Compu, Casa, Teléfono).
3. Captura en la web: un input y Enter, con el cliente `hc` y TanStack Query optimista. Después, la cola offline en IndexedDB y la PWA.

## Pendiente de decidir

- **¿Herramienta personal o producto?** Define auth, multi-tenancy, hosting y onboarding.
  Hasta decidirlo: single-user, con `user_id` en el modelo.
- Hosting y proveedor de Postgres (en dev: Docker local).
- Auth.

## Trampas conocidas

- Postgres del hub en el **5433** (`hub_db`): el 5432 lo ocupa `conserje_db`.
- pnpm 11 bloquea los postinstall: una dependencia nueva con build hay que habilitarla en `allowBuilds` (`pnpm-workspace.yaml`).
- TS 7 (nativo) no expone la API JS de TypeScript: si alguna herramienta la necesita (p. ej. typescript-eslint), bajar esa herramienta o usar TS 6 para ella.
- Un módulo nuevo con schema de Postgres propio hay que sumarlo a `schemaFilter` en `packages/db/drizzle.config.ts`, o drizzle-kit lo ignora.
- No correr `pkill -f vite` desde la shell de Claude: el patrón matchea la propia shell.
