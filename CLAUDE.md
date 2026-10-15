# Hub de productividad

> Documento raíz del proyecto. Claude Code lo lee al inicio de cada sesión.
> Contiene la visión, el flujo y la arquitectura. El estado vive en `ESTADO.md` y las decisiones en `DECISIONES.md`.

## Visión

Un hub personal que centraliza la productividad. Arranca con un solo módulo, **Loops**: volcar los pendientes abiertos de la cabeza ("mental dump"), procesarlos y convertirlos en acciones concretas. Después crece con más módulos (dashboard, agenda con Google, finanzas) y con IA, sin rehacer la base.

## Principios de producto

1. **Capturar, procesar y hacer son tres momentos distintos**, con tres pantallas distintas. Nunca pedir decisiones al capturar.
2. **La captura nunca falla.** Un input y Enter. Funciona offline y sincroniza después.
3. **Un loop no es una tarea.** "Cambiar filtro de aire" es un loop; lo accionable es su próximo paso ("comprar el filtro en la ferretería").
4. **En "Hoy" solo hay próximas acciones**: el primer paso pendiente de cada loop activo, filtrable por contexto.
5. **Lo premium es la velocidad.** Teclado primero, paleta de comandos, UI optimista, pocas pantallas.
6. **La IA sugiere y el usuario confirma.** Nunca modifica datos sin confirmación.

## Conceptos

| Concepto | Definición |
|---|---|
| Loop | Algo pendiente que ocupa la cabeza. Tiene estado, área y horizonte. |
| Paso | Acción física y concreta dentro de un loop. Tiene orden y contexto. |
| Próxima acción | Primer paso pendiente de un loop activo. Se calcula, no se guarda. Un loop sin pasos es su propia próxima acción. |
| Contexto | Dónde o con qué se puede hacer un paso: Calle, Compu, Casa, Teléfono. |
| Área | Dimensión de vida o trabajo: SELL, BUILD, SHARE, Hogar. |
| Horizonte | Cuándo se compromete un loop activo: hoy, semana, más adelante. |

## Flujo

1. **Capturar**: el loop entra con estado `inbox`.
2. **Procesar** (ritual, hasta dejar el inbox en cero). Una tecla por decisión:
   - Hoy / Semana / Más adelante → `active` con ese horizonte
   - Desglosar → editor de pasos, después asignar horizonte
   - Algún día → `someday`
   - Hecho (era trivial) → `done`
   - Descartar → `dropped`
3. **Hacer**: la vista Hoy muestra las próximas acciones de los loops con horizonte `today` (y opcionalmente `week`), filtrables por contexto. Completar un paso promueve el siguiente; completar el último cierra el loop.
4. **Revisar** (semanal): loops estancados, revisión de `someday` y resumen de lo cerrado en la semana.

Un loop está **estancado** si está activo y lleva 7 días (configurable) sin pasos completados ni ediciones.

## Arquitectura

**Monolito modular en un monorepo.** Sin microservicios ni microfrontends: la modularidad sale de límites estrictos entre módulos, no de procesos separados. Un módulo se extrae a un servicio aparte solo ante una necesidad real (escala, otro runtime).

```
hub/
  apps/
    web/            # shell: layout, navegación, paleta de comandos, dashboard
    api/            # único backend HTTP
    worker/         # jobs en segundo plano (sync de calendario, LLM, recordatorios)
  modules/
    loops/
      server/       # dominio, repositorio, rutas, eventos
      client/       # pantallas, componentes, comandos, widgets
      contract.ts   # API pública del módulo
  packages/
    ui/             # design system compartido
    core/           # auth, bus de eventos, registro de módulos, tipos compartidos
    db/             # cliente y migraciones
```

### Reglas de límites (no negociables)

- Cada módulo es dueño de su schema de Postgres (`loops.*`). Ningún otro módulo lee ni escribe esas tablas.
- Un módulo usa a otro solo a través de su `contract.ts` o de eventos.
- Los eventos de dominio se nombran en pasado: `loop.captured`, `loop.processed`, `step.completed`, `loop.completed`. En el MVP el bus es en memoria.
- Cada módulo se registra en el hub con un manifiesto: rutas, ítems de navegación, comandos para la paleta y widgets para el dashboard. Agregar un módulo no toca el shell.
- El worker es un proceso aparte porque las llamadas externas (Google, LLM) no deben bloquear requests.

### Stack (confirmado 2026-10-15)

- TypeScript en todo el monorepo, con pnpm workspaces y Turborepo
- Frontend: React + Vite, Tailwind v4 (tokens en `packages/ui/src/theme.css`), TanStack Query para updates optimistas, PWA con cola offline de capturas en IndexedDB
- Backend: Node con Hono (cliente RPC `hc` para tipos de punta a punta); validación con Zod compartida entre front y back
- Datos: Postgres 17 + Drizzle, con migraciones versionadas en `packages/db/migrations`
- Tests: Vitest; la lógica de dominio se testea sin base de datos
- Auth: a definir (ver decisiones abiertas)

## Modelo de datos: módulo Loops

```
loops.loops
  id, user_id, title, raw_text, status, area_id, horizon, source,
  created_at, processed_at, completed_at, updated_at, last_activity_at
  status:  inbox | active | someday | done | dropped
  last_activity_at: avance real (procesar, completar pasos, editar); reprogramar no cuenta
  horizon: today | week | later | null   (solo cuando status = active)
  source:  web | pwa | voice | bot | mcp

loops.steps
  id, user_id, loop_id, title, position, context_id, status,
  estimate_minutes (nullable), completed_at, created_at
  status: pending | done

loops.areas
  id, user_id, name, color, position     (seed: SELL, BUILD, SHARE, Hogar)

loops.contexts
  id, user_id, name, icon, position      (seed: Calle, Compu, Casa, Teléfono)
```

Todas las tablas llevan `user_id` desde el inicio, aunque el MVP sea de un solo usuario.

## Roadmap

### Fase 1: MVP Loops
- Monorepo inicializado con la estructura de arriba
- Captura rápida (web + PWA) con soporte offline y atajo de teclado dentro de la app
- Inbox con procesado por teclado
- Editor de pasos: agregar, reordenar, asignar contexto
- Vista Hoy con próximas acciones y filtro por contexto
- Completar un paso promueve el siguiente; el último cierra el loop
- Vista Loops: todos los loops, filtrables por estado y área

Criterio de salida: usarlo a diario durante 2 semanas antes de pasar a la Fase 2.

### Fase 2: Hub
- Shell con paleta de comandos (Ctrl+K) y registro de módulos
- Dashboard con widgets: loops abiertos, cerrados en la semana, estancados
- Weekly review guiado

### Fase 3: IA
- Servidor MCP del hub (`create_loop`, `list_inbox`, `list_next_actions`, `complete_step`, …) para que agentes externos, como El Bichote o Claude, lean y escriban loops
- Sugerencias dentro de la app: desglose de un loop en pasos, clasificación del inbox, detección de duplicados y estancados. Siempre con confirmación.

### Fase 4: Módulos
- Agenda: integración con Google Calendar para agendar próximas acciones como bloques
- Finanzas: reutilizar el agente de finanzas existente como cliente del hub

## Bitácora: dónde vive cada cosa

| Archivo | Responde | Ciclo de vida |
|---|---|---|
| `CLAUDE.md` | Qué construimos y por qué (visión, flujo, arquitectura, roadmap) | Estable |
| `ESTADO.md` | Dónde estamos hoy: progreso de la fase, cómo verificar, qué sigue, decisiones abiertas | Se reescribe |
| `DECISIONES.md` | Por qué el código es así (D1–D5 y las que vengan) | Se le agrega arriba |

Los hooks de usuario inyectan `ESTADO.md` y las últimas decisiones al iniciar sesión, y piden registrar decisiones si se tocó código. Para cerrar sesión: `/cierre`.

## Cómo trabajar en este repo (para Claude)

- Leer este documento al empezar cada sesión y respetar las reglas de límites entre módulos.
- Mauro es fuerte en frontend y está reforzando backend. En decisiones de backend (modelado, transacciones, eventos, migraciones), explicar el porqué en una o dos líneas.
- Cambios chicos y verificables. Correr typecheck y tests antes de dar algo por terminado.
- Toda decisión de arquitectura nueva se agrega arriba en `DECISIONES.md`, con el formato de ese archivo.
- Al cerrar cada sesión (`/cierre`): reescribir `ESTADO.md` con el progreso y el punto de partida de la próxima sesión.
- Identificadores de código en inglés; documentación y UI en español.
