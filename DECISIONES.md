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
