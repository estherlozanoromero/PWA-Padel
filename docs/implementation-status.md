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
- [ ] Fase 3 — Gestión y creación.
- [ ] Fase 4 — Marcador en directo.
- [ ] Fase 5 — Historial, estadísticas y backup.
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
