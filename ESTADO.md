# Estado

> Se **reescribe** al cerrar cada sesión, no se le agrega. Foto del proyecto hoy.
> Última actualización: 2026-10-15

## Dónde estamos

Monorepo andando (pnpm 11 + Turborepo + TS 7), en GitHub: `mauroNbome/central`.
Backend de captura y procesado completo: dominio puro, repositorio Drizzle,
servicio con transacciones y eventos post-commit, y rutas Hono montadas en la api.
**Primera UI andando** (Tailwind v4): captura arriba y dos pestañas, Inbox (`1`) y
Hoy (`2`), las dos como lista con cursor, una tecla por acción y updates optimistas.
Probada en Chromium headless (claro, oscuro, móvil, errores 409/500, teclas rápidas)
y validada por Mauro: navegación y atajos andan bien. Ya la usa con loops reales
en la base de dev. Todo commiteado y pusheado a `origin/main`.

### Fase 1 — MVP Loops

| Ítem | Estado |
|---|---|
| Monorepo inicializado (estructura de `CLAUDE.md`) | ✅ |
| Captura rápida web + PWA, offline, atajo de teclado | 🟡 web lista (`c` o `/` enfoca, Enter guarda, reintenta 3 veces); falta cola offline en IndexedDB y PWA |
| Inbox con procesado por teclado | 🟡 lista con cursor (`j`/`k`) y `h` `s` `m` `a` `x` `d`, validada por Mauro; falta "Desglosar" (`p`, espera al editor de pasos) |
| Editor de pasos: agregar, reordenar, contexto | ⬜ |
| Vista Hoy: próximas acciones + filtro por contexto | 🟡 secciones Hoy / Esta semana, `x` completa, `r` + `h`/`s`/`m` reprograma; cada loop es su propia próxima acción hasta que haya pasos; falta filtro por contexto (necesita pasos) |
| Completar paso promueve el siguiente; el último cierra el loop | ⬜ dominio listo (`completeStep`); falta api + UI. Completar un loop sin pasos ya anda (`POST /:id/complete`) |
| Vista Loops filtrable por estado y área | ⬜ |

Criterio de salida: 2 semanas de uso diario antes de la Fase 2.

## Cómo verificar

```bash
pnpm install
pnpm db:up && pnpm db:migrate && pnpm db:seed
pnpm typecheck          # 7 paquetes
pnpm test               # core 3 + loops 34 (dominio + teclado) + api 13 (integración, necesita Postgres)
pnpm dev                # api :3001, web :5173 (proxy /api → api)
```

Cambio de schema: editar `modules/<m>/server/schema.ts` → `pnpm db:generate` → revisar el SQL → `pnpm db:migrate`.

## Qué sigue

1. **Vista Loops** (`3`): todos los loops filtrables por estado y área. Es el único lugar donde se van a ver los de "Más adelante" y "Algún día", que hoy no aparecen en ninguna pantalla.
   Reusar `client/parts.tsx` y `useLoopCursor`; las teclas van en `client/keys.ts` (`tabKeys` ya reserva el `3`).
   Antes de decidir layout, filtros y teclas, proponer y preguntarle a Mauro.
2. Decidir con Mauro lo de "estancado" (ver abajo): es un cambio chico en el dominio.
3. **Rutas de pasos** (crear, reordenar, completar) y editor de pasos: entra "Desglosar" (`p`), Hoy muestra el primer paso pendiente y se puede filtrar por contexto.
4. Cola offline en IndexedDB + PWA. Hoy, sin red la captura queda en pausa en memoria y se pierde si se recarga.

## Pendiente de decidir

- **¿Herramienta personal o producto?** Define auth, multi-tenancy, hosting y onboarding.
  Hasta decidirlo: single-user con `HUB_USER_ID` fijo en `.env`.
- Hosting y proveedor de Postgres (en dev: Docker local).
- **¿Reprogramar cuenta como actividad para "estancado"?** Hoy sí (toca `updatedAt`), así que un loop que se posterga cada semana nunca se ve estancado. Para la revisión semanal convendría que no cuente.

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
- Para matar procesos desde la shell de Claude, **ni `pkill -f` ni `pgrep -f`**: el patrón matchea la propia shell y la mata. Usar `ps -eo pid,args | grep "[t]sx"` y `kill <pid>`.
