# Decisiones

Registro de por qué el código es como es. Más nuevo arriba.

**Qué va acá:** algo que alguien que llega nuevo **haría distinto si no lo
supiera**. Una decisión con su motivo, una alternativa que se descartó, una
restricción que no se ve leyendo el código, una trampa que costó encontrar.

**Qué NO va acá:** el changelog. "Agregué tests", "renombré una función",
"refactoricé el módulo" ya está en git y en el diff. Si el motivo del cambio se
entiende leyendo el diff, no es una decisión: es un commit.

**Formato:** tres líneas. Si no entra en tres líneas, probablemente sean dos
decisiones.

```markdown
## AAAA-MM-DD · Título en una línea
El motivo, en una oración. Qué pasaba o qué hubiera pasado si no.
→ archivos/que/toca.py, otro/archivo.sql

Cuarta línea opcional, sólo si hubo una alternativa seria que se descartó:
`✗ Descartado: ... porque ...`
```

## 2026-10-15 · "Estancado" usa `last_activity_at`, no `updated_at`
Mauro decidió que reprogramar no cuente como actividad. `updated_at` sigue siendo "cualquier cambio" porque lo usan el cache y la sync. La columna la mueven procesar, completar un paso y cerrar; reprogramar y asignar área no. La migración copia `updated_at` a mano porque el default `now()` dejaba todo "recién tocado".
→ modules/loops/server/domain.ts, packages/db/migrations/0001_unusual_mandroid.sql
✗ Descartado: no tocar `updated_at` al reprogramar, porque mentiría sobre cuándo cambió la fila.

## 2026-10-15 · Una vista con modos escucha teclas en fase de captura (`useHotkeys(…, { first: true })`)
Dentro de "asignar área" o "filtrar", el `1` es un área y no la pestaña 1. El shell ignora las teclas con `defaultPrevented`. El orden de registro no sirve, porque la vista se monta después que el shell y su listener queda segundo.
→ modules/loops/client/useHotkeys.ts, modules/loops/client/Loops.tsx

## 2026-10-15 · En la vista Loops el cursor sigue al siguiente loop por id, y un overlay local muestra el cambio en el acto
Ahí un loop decidido no desaparece: salta a otra sección. Con el cursor por índice, la segunda tecla caería sobre otro loop cualquiera, que puede ser uno real. El overlay tapa el tick en que el cache todavía no se actualizó, y se descarta cuando el cache trae el mismo objeto (`placeLoop`).
→ modules/loops/client/Loops.tsx, modules/loops/client/useLoopOverlay.ts, modules/loops/client/queries.ts

## 2026-10-15 · Activo → algún día o descartado con rutas propias (`/shelve`, `/drop`); el cliente elige la ruta según el estado
`planDecision` mapea las mismas teclas del inbox a process/reschedule/complete/shelve/drop. `processLoop` sigue rechazando activos, para no perder la protección contra la doble tecla en el inbox.
→ modules/loops/client/loopsView.ts, modules/loops/server/domain.ts

## 2026-10-15 · Que el área sea del mismo usuario se chequea en el servicio
La FK `area_id → areas.id` sólo garantiza que el área exista, no que sea del mismo usuario. Sin ese chequeo, un loop podría apuntar al área de otra persona.
→ modules/loops/server/service.ts

## 2026-10-15 · Reprogramar es una operación aparte, no "procesar" de nuevo
`processLoop` rechaza a propósito los loops activos: es lo que hace que una doble tecla en el inbox dé 409 en vez de pisar la primera decisión. Por eso `rescheduleLoop` (sólo activos) tiene su propia ruta, `POST /:id/reschedule`, y no emite eventos hasta que algún módulo los necesite (sumar uno toca `contract.ts`).
→ modules/loops/server/domain.ts, modules/loops/server/routes.ts
✗ Descartado: dejar procesar desde `active` porque se pierde la protección contra la doble tecla.

## 2026-10-15 · El inbox oculta en el acto los loops decididos, aparte del update optimista
TanStack Query saca el loop del cache recién un tick después de `mutate` (`await cancelQueries` + notificación con `setTimeout`): con dos teclas rápidas la segunda caía sobre el mismo loop y daba 409. Un set local de ids decididos lo resuelve en el mismo evento.
→ modules/loops/client/useLoopCursor.ts (lo usan Inbox y Hoy)

## 2026-10-15 · Rollback optimista por id, y refetch sólo al terminar la última mutación
Restaurar una "foto previa" del cache borra otras capturas en vuelo; refrescar después de cada decisión trae loops que el servidor todavía no procesó y reaparecen. Por eso `onError` saca o reinserta sólo ese loop y `settle` invalida cuando `isMutating` llega a 1.
→ modules/loops/client/queries.ts

## 2026-10-15 · Cada módulo arma su cliente `hc` con el tipo de sus propias rutas
`@hub/loops/server` exporta `LoopsRoutes` y el cliente del módulo hace `hc<LoopsRoutes>("/api/loops")`. Importar `AppType` de `apps/api` haría que un módulo dependa de una app, al revés de la arquitectura.
→ modules/loops/server/index.ts, modules/loops/client/api.ts
✗ Descartado: `hc<AppType>` en el shell inyectado a los módulos porque el shell tendría que conocer las rutas de cada módulo.

## 2026-10-15 · `@source` de Tailwind con glob de archivos, no de directorio
`@source "…/modules/*/client"` (directorio con comodín) no genera ninguna clase en `vite dev`; el build sí funciona porque escanea el grafo de módulos, así que el bug sólo se ve en dev. Con `…/client/**/*.{ts,tsx}` anda en los dos.
→ apps/web/src/index.css

## 2026-10-15 · El id de un loop sale de `newLoopId()`, no directo de `crypto.randomUUID()`
`randomUUID` sólo existe en contextos seguros (https o localhost): abriendo la app por IP de la red local, por ejemplo desde el celular, la captura fallaría. `newLoopId` cae a un UUID v4 con `getRandomValues`.
→ modules/loops/client/ids.ts

## 2026-10-15 · Tests de integración aislados por `user_id` aleatorio, sobre la base de dev
Cada test crea su propio usuario: no hace falta truncar tablas ni una base aparte, y los tests corren en paralelo sin pisarse. El costo es que la base de dev junta filas de prueba.
→ apps/api/src/app.test.ts
✗ Descartado: base `hub_test` con truncate entre tests porque obliga a correrlos en serie y a mantener dos bases migradas.

## 2026-10-15 · Procesar un loop toma `SELECT … FOR UPDATE`
Con doble tecla llegan dos decisiones a la vez: sin el lock las dos leen "inbox" y la última pisa a la primera. Con el lock, la segunda ve el loop procesado y recibe 409.
→ modules/loops/server/service.ts

## 2026-10-15 · El `userId` sale del contexto Hono, nunca del request
Un middleware de la api lo pone (hoy `HUB_USER_ID` fijo); las rutas sólo leen `c.get("userId")`. Cuando llegue auth cambia ese middleware y nada más.
→ packages/core/src/http.ts, apps/api/src/app.ts

## 2026-10-15 · El dominio devuelve eventos; se emiten después de guardar
Las funciones de `domain.ts` son puras y devuelven `events`; quien las llama los emite tras el commit. Emitir antes anunciaría cosas que terminaron en rollback.
→ modules/loops/server/domain.ts

## 2026-10-15 · El id de un loop lo genera el cliente
La captura offline se reintenta: con id del cliente el reintento es idempotente (`on conflict do nothing`) en vez de duplicar el loop. Por eso `loops.id` no tiene default.
→ modules/loops/contract.ts, modules/loops/server/schema.ts

## 2026-10-15 · CHECK en Postgres: un loop tiene horizonte si y sólo si está activo
El invariante vive también en la base, así un bug en la api no deja loops activos sin horizonte (que desaparecerían de Hoy) ni cerrados con horizonte.
→ modules/loops/server/schema.ts (`loops_horizon_iff_active`)

## 2026-10-15 · `steps` lleva `user_id` aunque el modelo original no lo tenía
D5 dice "todas las tablas"; filtrar pasos por usuario sin join también abarata la vista Hoy. Se corrigió el modelo en CLAUDE.md.
→ modules/loops/server/schema.ts

## 2026-10-15 · Schemas en cada módulo, migraciones en una sola secuencia en `packages/db`
Cada módulo define su `server/schema.ts`; drizzle-kit los junta en un único historial, con un solo orden de aplicación. Al sumar un módulo hay que agregar su schema de Postgres a `schemaFilter`.
→ packages/db/drizzle.config.ts, packages/db/migrations/

## 2026-10-15 · Paquetes internos sin build: se consumen como fuente `.ts`
Los `exports` apuntan a `.ts`; Vite y tsx compilan al vuelo. Sin pasos de build ni watchers entre paquetes. Los `exports` además son el límite del módulo: `@hub/loops` sólo expone contract, server y client.
→ */package.json, tsconfig.base.json
✗ Descartado: project references con build por paquete porque suma un watcher por paquete sin beneficio para un solo dev.

## 2026-10-15 · Hono en vez de Fastify
El cliente RPC `hc` comparte los tipos de las rutas con el front sin codegen (D2), valida con Zod nativo y corre en Node o edge si el hosting termina siendo serverless.
→ apps/api
✗ Descartado: Fastify, más maduro en Node pero sin tipos de punta a punta de serie.

## 2026-10-15 · Bitácora en tres archivos: CLAUDE.md, ESTADO.md, DECISIONES.md
El estado y las decisiones vivían dentro de CLAUDE.md y se iban a pisar con la visión estable; separados, los hooks los inyectan al iniciar sesión.
→ CLAUDE.md, ESTADO.md, DECISIONES.md

## 2026-10-15 · `user_id` en todas las tablas desde el día 1 (D5)
Seguro barato por si pasa a multi-usuario; agregarlo después obliga a migrar datos y tocar cada query.
→ modules/loops/server (schema `loops.*`)

## 2026-10-15 · La próxima acción se calcula, no se persiste (D4)
Guardarla duplica información que ya está en `steps` y abre la puerta a estados inconsistentes.
→ modules/loops/server

## 2026-10-15 · La IA entra principalmente vía MCP (D3)
Cualquier agente (El Bichote, Claude) usa el hub sin una integración a medida por agente.
→ Fase 3, servidor MCP del hub

## 2026-10-15 · TypeScript de punta a punta (D2)
Tipos y schemas Zod compartidos entre front y back; lo agéntico en Python se conecta por API o MCP, no por código compartido.
→ todo el monorepo

## 2026-10-15 · Monolito modular, sin microservicios ni microfrontends (D1)
Un solo dev: esas arquitecturas resuelven escala organizacional, no de código. Los límites estrictos (`contract.ts`, eventos, schema propio) permiten extraer un módulo después.
→ apps/, modules/, packages/
✗ Descartado: microservicios/microfrontends porque el costo operativo no se paga con un equipo de uno.
