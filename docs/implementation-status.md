# Estado de implementación

## Fase 0 — Arranque y guardarraíles

- [x] Proyecto React + TypeScript + Vite.
- [x] TypeScript estricto y alias `@/`.
- [x] Tailwind CSS y shell mobile-first.
- [x] React Router con navegación principal.
- [x] Configuración inicial PWA.
- [x] Vitest, Testing Library y Playwright.
- [x] ESLint y Prettier.
- [x] Validación completa de scripts de calidad.

### Evidencia

- `pnpm check`: typecheck, lint, formato, Vitest y build PWA correctos.
- `pnpm test:e2e`: recorrido del shell móvil correcto en Chromium (Pixel 7).
- Build generado con manifest, service worker y precaché.

## Fases siguientes

- [x] Fase 1 — Dominio de puntuación y servicio.
- [x] Fase 2 — IndexedDB y casos de uso.
- [x] Fase 3 — Gestión y creación.
- [x] Fase 4 — Marcador en directo.
- [x] Fase 5 — Historial, estadísticas y backup.
- [ ] Fase 6 — PWA y endurecimiento final.

## Fase 1 — Evidencia

- [x] Presets y validación de reglas.
- [x] Ventaja, punto de oro y Star Point FIP 2026.
- [x] Sets normales, tie-break y super tie-break decisivo.
- [x] Orden de servicio entre parejas y secuencia `1-2-2` en desempates.
- [x] Elección de receptor y regla de mismo sexo en partidos mixtos.
- [x] Máquina de estados, pausa, reanudación y cancelación.
- [x] Eventos, replay determinista y deshacer lógico sin borrar historial.
- [x] Pruebas generativas de inmutabilidad e invariantes.
- [x] Cobertura: más del 90 % de líneas del dominio y 100 % de ramas en puntuación/servicio.

## Fase 2 — Evidencia

- [x] Repositorio Git inicializado en la rama `main`.
- [x] Base Dexie `padel-scorekeeper`, esquema v1 e índices únicos.
- [x] CRUD de jugadores con normalización, búsqueda, archivado y restauración.
- [x] Creación de parejas con clave canónica y reutilización sin duplicados.
- [x] Puertos de repositorio separados de los adaptadores IndexedDB.
- [x] Creación y ejecución transaccional de partidos.
- [x] Eventos con secuencia única, snapshots y campos derivados coordinados.
- [x] Deshacer mediante eventos de reversión.
- [x] Recuperación y reparación de snapshots ausentes, atrasados o corruptos.
- [x] Pruebas de rollback transaccional y restricciones de integridad.

## Fase 3 — Evidencia

- [x] Pantalla móvil de jugadores con alta, edición, búsqueda, archivado y restauración.
- [x] Pantalla de parejas con selección de dos jugadores, reutilización y archivado.
- [x] Asistente de partido en cuatro pasos: pareja A, pareja B, reglas y saque.
- [x] Exclusión visual y de dominio de jugadores repetidos.
- [x] Cinco presets de reglas con Star Point 2026 como opción destacada.
- [x] Selección de pareja inicial y primer sacador de cada lado.
- [x] Creación real en IndexedDB y navegación a partido preparado.
- [x] Pruebas de componentes para gestión y asistente.
- [x] E2E móvil: cuatro jugadores → dos parejas → reglas → saque → partido listo.

## Fase 4 — Evidencia

- [x] Marcador táctil mobile-first con puntos, juegos, sets y sacador visible.
- [x] Puntuación normal, tie-break y super tie-break conectados al motor de dominio.
- [x] Ventaja, punto de oro y Star Point con elección explícita de lado y receptor.
- [x] Cambio de lado y confirmación del orden de saque entre sets.
- [x] Pausa, reanudación y deshacer desde la pantalla en directo.
- [x] Bloqueo breve contra doble pulsación y feedback háptico cuando está disponible.
- [x] Persistencia transaccional de cada acción y recuperación después de recargar o cerrar.
- [x] Acceso desde inicio a todos los partidos activos o pausados.
- [x] Diálogo final con ganador y posibilidad de deshacer el último punto.
- [x] Pruebas de componente y E2E móvil de marcador, recuperación y Star Point.

## Fase 5 — Evidencia

- [x] Historial ordenado con pestañas para activos, finalizados y cancelados.
- [x] Filtros de historial por jugador y fecha.
- [x] Detalle de partido con participantes, reglas, sets, tie-breaks, ganador, duración y eventos.
- [x] Agregador TypeScript puro para estadísticas globales, por jugador y por pareja.
- [x] PJ, PG, PP, porcentaje, sets, juegos y puntos a favor y en contra.
- [x] Exclusión de partidos activos/cancelados y tratamiento específico del super tie-break.
- [x] Backup JSON v1 con SHA-256, validación Zod e integridad referencial.
- [x] Vista previa antes de importar y estrategia atómica `replace_all`.
- [x] Exportación automática de seguridad antes de restaurar.
- [x] Regeneración de snapshots desde los eventos después de importar.
- [x] Pruebas de agregados, exclusiones, super tie-break y round-trip de backup.
