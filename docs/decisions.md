# Decisiones de arquitectura

## ADR-001 — Aplicación local-first

- **Estado:** aceptada
- **Decisión:** la aplicación funcionará sin servidor y usará IndexedDB como persistencia del MVP.
- **Motivo:** el marcador debe seguir operativo en pistas con conectividad limitada.

## ADR-002 — Dominio independiente

- **Estado:** aceptada
- **Decisión:** puntuación, servicio y estadísticas serán TypeScript puro sin dependencias de React ni Dexie.
- **Motivo:** permite pruebas deterministas y futuras interfaces o persistencias alternativas.

## ADR-003 — Runtime de desarrollo

- **Estado:** aceptada
- **Decisión:** el proyecto requiere Node 22 o superior y usa pnpm con lockfile.
- **Motivo:** la instalación global disponible es antigua; el runtime moderno de Codex evita modificarla.

## ADR-004 — Eventos como fuente de verdad del partido

- **Estado:** aceptada
- **Decisión:** cada acción del partido se representa como un evento ordenado. Los eventos se revierten mediante `EVENT_REVERTED`; no se borran.
- **Motivo:** permite reconstrucción determinista, auditoría y deshacer incluso después de cerrar juego, set o partido.

## ADR-005 — Star Point FIP 2026

- **Estado:** aceptada
- **Decisión:** Star Point usa `deuce 1`, primera ventaja, `deuce 2`, segunda ventaja y `deuce 3 / Star Point` decisivo.
- **Motivo:** reproduce la regla FIP 2026 y limita un juego a un máximo de once puntos.

## ADR-006 — IndexedDB mediante Dexie

- **Estado:** aceptada
- **Decisión:** la base `padel-scorekeeper` usa un esquema Dexie versionado con tablas para jugadores, parejas, partidos, eventos, snapshots y ajustes.
- **Motivo:** IndexedDB aporta persistencia offline y Dexie permite migraciones y transacciones comprobables.

## ADR-007 — Escritura transaccional del marcador

- **Estado:** aceptada
- **Decisión:** cada comando guarda eventos, snapshot y campos derivados del partido dentro de una única transacción.
- **Motivo:** un cierre o error de almacenamiento no puede dejar el historial y el marcador en estados diferentes.

## ADR-008 — Validación de snapshots

- **Estado:** aceptada
- **Decisión:** antes de confiar en un snapshot se compara con el estado reconstruido desde los eventos; si falta, está atrasado o difiere, se reemplaza.
- **Motivo:** el historial de eventos sigue siendo la fuente de verdad incluso ante datos locales corruptos.

## ADR-009 — Asistente de partido basado en jugadores

- **Estado:** aceptada
- **Decisión:** el asistente selecciona cuatro jugadores y crea o reutiliza automáticamente sus parejas al confirmar.
- **Motivo:** reduce pasos en pista y sigue conservando parejas canónicas reutilizables.

## ADR-010 — Carga diferida por pantalla

- **Estado:** aceptada
- **Decisión:** las pantallas de gestión, creación y partido se cargan mediante módulos dinámicos.
- **Motivo:** evita cargar Dexie, formularios y motor en la pantalla inicial antes de que sean necesarios.

## ADR-011 — Confirmación persistida antes de actualizar el marcador

- **Estado:** aceptada
- **Decisión:** la pantalla en directo espera a que el comando se guarde correctamente antes de mostrar el nuevo estado y bloquea pulsaciones repetidas durante 350 ms.
- **Motivo:** evita puntos duplicados y garantiza que lo visible siempre pueda recuperarse desde IndexedDB después de un cierre inesperado.

## ADR-012 — Decisiones reglamentarias explícitas

- **Estado:** aceptada
- **Decisión:** Star Point solicita lado y receptor en un diálogo bloqueante; los cambios de lado y el orden de saque entre sets también requieren confirmación.
- **Motivo:** son decisiones humanas que el motor no debe inferir y deben quedar registradas como eventos reproducibles.
