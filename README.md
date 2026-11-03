# Padel Scorekeeper

PWA móvil y local-first para gestionar jugadores, parejas y partidos de pádel, con reglas configurables y control del saque.

El motor TypeScript ya implementa ventaja, punto de oro, Star Point FIP 2026, sets, tie-breaks, super tie-break, rotación de saque, replay y deshacer.

La persistencia local usa IndexedDB mediante Dexie. Jugadores y parejas se archivan sin borrar el historial, y cada comando de partido guarda eventos y snapshot en una única transacción.

La interfaz permite gestionar la plantilla, crear un partido completo mediante un asistente móvil de cuatro pasos y llevar el marcador en directo. Cada punto se conserva localmente, los partidos activos se pueden recuperar y están disponibles la pausa, el deshacer, los cambios de lado y las decisiones de Star Point.

El historial incluye filtros y resúmenes detallados. Las estadísticas por jugador y pareja se reconstruyen desde los partidos finalizados. En Ajustes se puede exportar o restaurar un backup JSON; antes de reemplazar datos se descarga automáticamente una copia de seguridad del estado actual.

## Requisitos

- Node.js 22 o superior.
- pnpm 11.

## Desarrollo

```bash
pnpm install
pnpm dev
```

## Calidad

```bash
pnpm check
pnpm test:coverage
pnpm test:e2e
```

La especificación funcional completa está en [PLAN_IMPLEMENTACION_PWA_MARCADOR_PADEL.md](./docs/PLAN_IMPLEMENTACION_PWA_MARCADOR_PADEL.md).
