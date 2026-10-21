# Estado

> Se **reescribe** al cerrar cada sesión, no se le agrega. Foto del proyecto hoy.
> Última actualización: 2026-10-21

## Dónde estamos

Monorepo andando (pnpm 11 + Turborepo + TS 7), en GitHub: `mauroNbome/central`.
Backend de captura y procesado completo: dominio puro, repositorio Drizzle,
servicio con transacciones y eventos post-commit, y rutas Hono montadas en la api.
UI con tres pestañas: Inbox (`1`), Hoy (`2`) y Loops (`3`), las tres validadas por Mauro
y en uso con loops reales. Áreas (listar y asignar) y "estancado" con `last_activity_at`
(reprogramar no cuenta) están andando. La migración `0001` está aplicada en la base de dev.
**Nuevo y commiteado:** pasos de punta a punta (rutas, editor inline con `p`, Hoy con el
primer paso pendiente y filtro por contexto), deshacer un "hecho" (`u`) y "Hecho hoy" al final
de Hoy. Probado en headless y aprobado por Mauro; falta su feedback de uso diario.

### Fase 1 — MVP Loops

| Ítem | Estado |
|---|---|
| Monorepo inicializado (estructura de `CLAUDE.md`) | ✅ |
| Captura rápida web + PWA, offline, atajo de teclado | 🟡 web lista (`c` o `/` enfoca, Enter guarda, reintenta 3 veces); falta cola offline en IndexedDB y PWA |
| Inbox con procesado por teclado | ✅ cursor (`j`/`k`), `h` `s` `m` `a` `x` `d` validados por Mauro; `p` desglosa |
| Editor de pasos: agregar, reordenar, contexto | 🟡 inline bajo la fila, con `p` en Inbox, Hoy y Loops. Abre escribiendo (Enter agrega); Esc pasa a ordenar: `j`/`k`, Shift+`J`/`K` reordena, `c` + `1`–`4` contexto (`0` lo quita), `x` completa (sólo activos), `d` borra (sólo pendientes), `i`/`o`/Enter vuelve a escribir, Esc cierra. Falta: editar el título de un paso |
| Vista Hoy: próximas acciones + filtro por contexto | 🟡 cada fila es el primer paso pendiente (el loop abajo, chico) o el loop mismo si no tiene pasos. `f` + número o los chips filtran por contexto; un loop sin pasos queda afuera del filtro. Al completar, la fila se tacha y se desvanece en su lugar (~0,7 s) y lo hecho entra a **"Hecho hoy"** (abajo, con contador y hora; `x` ahí reabre si se llegó con `j`/`k` o clic) |
| Completar paso promueve el siguiente; el último cierra el loop | 🟡 `x` en Hoy o en el editor; en el editor el cursor pasa al próximo pendiente. Deshacer: `u` o el botón del aviso (también para un loop sin pasos cerrado desde Hoy, y reabre el loop con su horizonte si se había cerrado), y `x` sobre un paso hecho en el editor lo vuelve a pendiente. Probado en headless |
| Vista Loops filtrable por estado y área | ✅ validada por Mauro. Secciones Inbox / Hoy / Esta semana / Más adelante / Algún día / Cerrados (plegados). Las teclas del inbox re-deciden cualquier loop abierto; `e` + `1`–`4` asigna área (`0` la quita); `f` + letra filtra estado (`t` `i` `e` `a` `c`) y `f` + número, área. Los cerrados son de solo lectura |

Criterio de salida: 2 semanas de uso diario antes de la Fase 2.

## Cómo verificar

```bash
pnpm install
pnpm db:up && pnpm db:migrate && pnpm db:seed
pnpm typecheck          # 7 paquetes
pnpm test               # core 3 + loops 82 (dominio + teclado + vista Loops + pasos + Hecho hoy) + api 25 (integración, necesita Postgres)
pnpm dev                # api :3001, web :5173 (proxy /api → api)
```

Cambio de schema: editar `modules/<m>/server/schema.ts` → `pnpm db:generate` → revisar el SQL (¿hace falta backfill?) → `pnpm db:migrate`.

## Qué sigue

1. **Feedback de Mauro usando los pasos a diario.** Cosas para mirarle:
   - Desde el inbox, `p` → pasos → Esc → Esc → `h`: son dos Esc para volver a decidir.
   - Un paso nuevo arranca sin contexto (¿heredar el del paso anterior?).
   - No se puede editar el título de un paso (hoy: `d` y escribirlo de nuevo).
   - En Hoy, el filtro por contexto esconde los loops sin pasos.
   - Deshacer cubre completar (pasos y loops de Hoy), no las decisiones del inbox ni de la vista Loops.
   - "Hecho hoy" incluye lo cerrado con `x` desde el inbox o la vista Loops, y respeta el filtro por contexto (sólo pasos de ese contexto).
   - Reabrir desde "Hecho hoy" un loop ya cerrado lo vuelve a Hoy (el horizonte que tenía se pierde al cerrar).
   - Sin respuesta todavía: al completar un paso en Hoy, ¿el cursor tiene que saltar al loop siguiente? Hoy se queda en el mismo loop, que muestra su próximo paso.
2. Cola offline en IndexedDB + PWA. Hoy, sin red la captura queda en pausa en memoria y se pierde si se recarga.
3. Cuando haya edición de título o texto (del loop o de un paso): tiene que mover `lastActivityAt`, porque editar cuenta como actividad.
4. Detalles de la vista Loops que Mauro no pidió, para cuando moleste alguno: en móvil los chips ocupan 4 líneas, el área se ve solo como texto en la fila, no hay filtro "sin área".

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
- Tailwind: `@source` tiene que apuntar a archivos (`…/client/**/*.{ts,tsx}`). Un directorio con comodín anda en build pero no genera nada en `vite dev`. Y ojo con escribir `/*` seguido de `*/` en un comentario CSS, porque lo cierra.
- **La base de dev tiene loops reales de Mauro** (`HUB_USER_ID`). Al probar la UI, usar títulos `[prueba] …`, hacer clic en la fila antes de cada tecla (nunca confiar en la posición del cursor) y borrarlos después con `docker exec hub_db psql -U hub -d hub`.
- Para manejar la app desde la shell: `playwright-core` en `/root/.npm/_npx/e41f203b7505f1fb/node_modules` con `executablePath` del `chromium_headless_shell-1217` en `~/.cache/ms-playwright` (el que pide por defecto no está instalado).
- `pnpm test` puede fallar una vez con `ENOTEMPTY … .vitest-cache` justo después de cambiar dependencias (carrera entre paquetes en paralelo). Se arregla volviendo a correrlo.
- **Probar teclas destructivas (`x`, `d`) en headless, sólo con la vista aislada.** Antes, filtrá para que únicamente queden loops `[prueba]` (en Hoy: pasos de prueba en un contexto y `f` + ese número; los loops reales sin pasos no aparecen) y chequeá la pestaña activa (`nav button[aria-current=page]`). Una tecla que cae en otra vista puede cerrar un loop real.
- Vite (`pnpm dev`) cachea un import que falló: si un archivo se importa antes de crearlo, sigue dando 500 aunque ya exista. `touch apps/web/vite.config.ts` reinicia Vite sin matar el `pnpm dev` (que puede ser de Mauro).
- La app enfoca el input de captura al cargar: en Playwright, hacer clic en el fondo antes de mandar teclas, o se escriben en el input.
- `useLoops()` sin estado trae **todos** los loops, incluidos los cerrados; lo usan la vista Loops y "Hecho hoy" en Hoy. Si algún día pesa, paginar los cerrados.
- Para matar procesos desde la shell de Claude, **ni `pkill -f` ni `pgrep -f`**: el patrón matchea la propia shell y la mata. Usar `ps -eo pid,args | grep "[t]sx"` y `kill <pid>`.
