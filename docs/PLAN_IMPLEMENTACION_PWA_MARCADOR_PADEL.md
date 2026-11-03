# Plan de implementación — PWA móvil de marcador de pádel

> Especificación ejecutable para Codex · MVP local-first · React + TypeScript · Versión 1.0

## 0. Propósito del documento

Este documento define una PWA móvil para gestionar jugadores, parejas y partidos de pádel; contar el marcador en directo; controlar el saque; persistir todos los datos en IndexedDB; recuperar y deshacer acciones; y mostrar estadísticas básicas.

Está pensado para entregarse directamente a Codex. Las decisiones funcionales y técnicas importantes están cerradas. Si durante la implementación aparece una ambigüedad menor, debe elegirse la solución más simple que preserve los invariantes y anotarse en `docs/decisions.md`. No se deben modificar las reglas deportivas descritas aquí sin una decisión explícita del propietario del producto.

---

## 1. Decisiones de producto ya tomadas

| Área | Decisión |
|---|---|
| Dispositivo principal | Móvil, usable también en escritorio |
| Tipo de aplicación | PWA instalable y offline |
| Persistencia | Local en IndexedDB |
| Reglas | Configurables por partido, mediante presets válidos |
| Modos de juego | Ventaja, punto de oro y Star Point FIP 2026 |
| Servicio | Control del jugador que saca y de la rotación |
| Modalidad inicial | Dobles: dos parejas y cuatro jugadores distintos |
| Estadísticas | Básicas: partidos, victorias, sets, juegos y puntos |
| Fuente de verdad | Eventos inmutables del partido, ordenados por secuencia |
| Deshacer | Reversión lógica del último punto y reconstrucción determinista |
| Nube, usuarios y Excel | Fuera del MVP; arquitectura preparada para añadirlos |

### Principios

1. El motor de puntuación es TypeScript puro y no depende de React, Dexie, el reloj ni APIs del navegador.
2. Las reglas se copian dentro del partido al crearlo; cambiar los valores por defecto nunca altera el historial.
3. La composición de las parejas también se captura dentro del partido para conservar el dato histórico.
4. Todo punto confirmado se guarda antes de considerarse definitivo en la interfaz.
5. El partido puede reconstruirse únicamente con su configuración inicial y sus eventos activos.
6. El MVP funciona completamente sin conexión después de la primera carga.

---

## 2. Alcance

### Incluido en el MVP

- Alta, edición, archivo y búsqueda de jugadores.
- Campo de sexo/género deportivo opcional (`male`, `female`, `unspecified`) para validar la regla de recepción en partidos mixtos cuando haya datos suficientes.
- Creación y archivo de parejas de exactamente dos jugadores diferentes.
- Detección y reutilización de una pareja ya existente, sin duplicados por orden inverso.
- Asistente de creación de partido con cuatro jugadores distintos.
- Presets de reglas y configuración permitida.
- Selección de la pareja y el jugador que sacan primero en cada set.
- Marcador completo: puntos, juegos, sets, tie-break y super tie-break.
- Ventaja tradicional, punto de oro y Star Point FIP 2026.
- Elección del lado de recepción en puntos decisivos.
- Rotación del sacador en juegos normales y tie-breaks.
- Avisos de cambio de lado.
- Pausar, reanudar, cancelar y deshacer el último punto.
- Recuperación automática de partidos activos tras cerrar o recargar.
- Historial y detalle de partidos.
- Estadísticas básicas por jugador y por pareja.
- Copia de seguridad y restauración mediante JSON versionado.
- PWA instalable, responsive, accesible y offline.

### Fuera del MVP

- Inicio de sesión, sincronización en la nube y colaboración en directo.
- Torneos, rankings ELO y reservas de pista.
- Individuales, americano, mexicano u otros formatos.
- Estadísticas avanzadas por golpe: ace, winner, error forzado/no forzado.
- Edición arbitraria de eventos históricos; solo se deshace el último punto activo.
- Exportación `.xlsx` — se preparan casos de uso y datos, pero no se implementa.
- Notificaciones push, wearables, voz y sensores.

---

## 3. Glosario e invariantes

- **Side**: lado lógico del marcador, `A` o `B`.
- **Pareja/Team**: dos jugadores distintos.
- **Juego normal**: juego puntuado 0, 15, 30, 40 y la estrategia de deuce elegida.
- **Tie-break**: desempate que decide un set, normalmente a 7 con diferencia de 2.
- **Super tie-break**: desempate que reemplaza íntegramente el set decisivo, normalmente a 10 con diferencia de 2.
- **Evento activo**: evento no revertido y que participa en la reconstrucción.
- **Snapshot**: caché derivada; nunca es la fuente de verdad.

Invariantes obligatorios:

- Un partido tiene exactamente dos parejas y cuatro jugadores distintos.
- Un orden de servicio contiene los cuatro jugadores una sola vez y alterna parejas.
- No se aceptan puntos si el partido está pausado, terminado, cancelado o esperando configurar el saque.
- Un partido terminado no acepta nuevos puntos; deshacer el punto final puede reabrirlo.
- `sequence` es único y estrictamente creciente dentro de un partido.
- El resultado final se deriva; no se introduce manualmente.
- Las estadísticas usan solo partidos `finished` y eventos activos.
- El borrado de jugadores y parejas con historial es archivado lógico.

---

## 4. Reglas deportivas exactas

### 4.1 Puntuación base

Los tres primeros puntos de una pareja se muestran como `15`, `30` y `40`. Con menos de tres puntos por ambos lados, el cuarto punto cierra el juego. Desde 40-40 se aplica la estrategia configurada.

Internamente no se guardan las etiquetas 15/30/40: se guardan contadores y un estado de deuce. La presentación deriva las etiquetas.

### 4.2 Modo `advantage`

- En 40-40: `deuce`.
- El siguiente punto concede ventaja.
- Si la misma pareja gana el punto posterior, gana el juego.
- Si lo pierde, vuelve a `deuce`.
- Se repite sin límite hasta que una pareja gane dos puntos consecutivos desde iguales.

### 4.3 Modo `golden_point`

- En 40-40 se juega inmediatamente un punto decisivo.
- La pareja restadora elige recibir en el lado derecho o izquierdo.
- No puede cambiar la colocación de sus jugadores solo para ese punto.
- La pareja que gana el punto gana el juego.
- El estado pasa a `awaiting_receiver_side` antes de permitir registrar el punto decisivo.
- Si ambos jugadores de la pareja restadora tienen sexo deportivo declarado y el partido es mixto, el receptor del punto decisivo debe ser del mismo sexo que quien saca. Si faltan datos, se registra el lado pero no se bloquea el partido.

### 4.4 Modo `star_point` — FIP 2026

Esta definición es normativa para el producto:

1. Al llegar por primera vez a 40-40: `deuce_1`.
2. Quien gana el siguiente punto obtiene `advantage_1`.
3. Si esa misma pareja gana el punto posterior, gana el juego.
4. Si pierde, se pasa a `deuce_2`.
5. Quien gana el siguiente punto obtiene `advantage_2`.
6. Si esa misma pareja gana el punto posterior, gana el juego.
7. Si pierde, se pasa a `deuce_3_star`, un único Star Point decisivo.
8. Antes del Star Point, la pareja restadora elige lado derecho o izquierdo y no cambia su colocación para recibir.
9. Quien gana el Star Point gana el juego.

Secuencia máxima desde el primer 40-40: ventaja 1, retorno a iguales, ventaja 2, retorno a iguales/Star Point y punto decisivo. Como el primer 40-40 se alcanza tras 6 puntos, un juego Star Point tiene un máximo de 11 puntos totales.

Para partidos mixtos se aplica la misma validación del receptor descrita para el punto de oro.

### 4.5 Sets normales

Valores del preset estándar:

- Se gana el set al alcanzar al menos 6 juegos con diferencia mínima de 2.
- Con 6-6 se inicia un tie-break.
- El ganador del tie-break gana el set 7-6.
- Con configuración `noTieBreak`, el set continúa hasta una diferencia de 2; esta opción no estará visible en el preset principal, pero el dominio la admite para pruebas y futura activación.

La validación de configuración debe impedir `tieBreakAt < gamesToWinSet` y otras combinaciones incoherentes.

### 4.6 Tie-break

- Objetivo predeterminado: 7 puntos.
- Se gana al alcanzar el objetivo con diferencia mínima de 2.
- El jugador al que le corresponde servir inicia con un solo punto de saque.
- Después, cada jugador sirve dos puntos siguiendo el orden circular del set.
- Secuencia para índices `[0,1,2,3]`: `0, 1,1, 2,2, 3,3, 0,0…`.
- Fórmula, siendo `pointsPlayed` el número de puntos completados antes del siguiente punto:

```ts
export function tieBreakServerIndex(
  firstServerIndex: number,
  pointsPlayed: number,
): number {
  if (pointsPlayed === 0) return firstServerIndex;
  return (firstServerIndex + 1 + Math.floor((pointsPlayed - 1) / 2)) % 4;
}
```

- Se muestra cambio de lado cada 6 puntos completados.
- La pareja cuyo jugador sirvió el primer punto del tie-break recibirá en el primer juego del set siguiente.
- El tie-break cuenta como un juego para el resultado del set, pero sus puntos se guardan por separado.

### 4.7 Super tie-break decisivo

- Reemplaza íntegramente el set decisivo; no es un juego dentro de un set normal.
- Objetivo predeterminado: 10 puntos, diferencia mínima de 2.
- Usa la misma rotación de servicio `1,2,2,2…`.
- Se muestra cambio de lado cada 6 puntos.
- El resultado se representa como un set decisivo de tipo `super_tiebreak`, por ejemplo `[10-7]`, y no como `1-0` en juegos.

### 4.8 Rotación del saque

Al comienzo de cada set normal:

1. El dominio determina qué pareja debe servir primero.
2. Esa pareja elige cuál de sus jugadores sirve primero.
3. La otra pareja elige cuál de sus jugadores servirá en su primer turno.
4. Se construye un orden alterno de cuatro jugadores. Ejemplo: `A1, B1, A2, B2`.
5. El orden queda fijo hasta terminar el set.

Tras cada juego normal se avanza un índice. No se puede cambiar manualmente el sacador a mitad de un juego.

Al inicio del primer set, el usuario elige la pareja inicial. En sets posteriores la pareja que sirve primero se deriva de la alternancia reglamentaria; el usuario solo elige cuál de sus dos integrantes inicia el turno de esa pareja y quién inicia en la contraria.

### 4.9 Cambios de lado

- En un set normal, se avisa después del primer juego y después de cada número impar de juegos completados.
- Al terminar un set se avisa de cambio de lado salvo que el total de juegos de ese set sea par; en ese caso se cambia tras el primer juego del set siguiente.
- En tie-break y super tie-break, se avisa cada 6 puntos.
- El MVP muestra un aviso confirmable; no bloquea permanentemente la anotación si el usuario lo descarta.

---

## 5. Presets de reglas

La interfaz ofrece presets seguros y permite ajustar solo campos compatibles.

```ts
export type DeuceMode = "advantage" | "golden_point" | "star_point";
export type DecidingSetMode = "normal_set" | "super_tiebreak";

export interface MatchRules {
  schemaVersion: 1;
  bestOfSets: 3 | 5;
  deuceMode: DeuceMode;
  gamesToWinSet: 6;
  minGameLeadInSet: 2;
  tieBreakEnabled: boolean;
  tieBreakAtGames: 6;
  tieBreakTarget: 7;
  tieBreakMinLead: 2;
  decidingSetMode: DecidingSetMode;
  superTieBreakTarget: 10;
  superTieBreakMinLead: 2;
}
```

Presets iniciales:

- `classic_best_of_3`: ventaja, mejor de 3, tie-break a 7 en 6-6, set decisivo normal.
- `golden_best_of_3`: punto de oro, mejor de 3, tie-break a 7, set decisivo normal.
- `star_2026_best_of_3`: Star Point, mejor de 3, tie-break a 7, set decisivo normal.
- `golden_super_tiebreak`: punto de oro, mejor de 3, tercer set como super tie-break a 10.
- `star_2026_super_tiebreak`: Star Point, mejor de 3, tercer set como super tie-break a 10.

`validateRules(rules)` devuelve todos los errores, no solo el primero.

---

## 6. Estados y máquina de partido

```ts
export type MatchStatus =
  | "draft"
  | "awaiting_set_service_order"
  | "playing"
  | "awaiting_receiver_side"
  | "paused"
  | "finished"
  | "cancelled";
```

Transiciones permitidas:

```text
draft
  -> awaiting_set_service_order
  -> cancelled

awaiting_set_service_order
  -> playing                (orden válido confirmado)
  -> cancelled

playing
  -> awaiting_receiver_side (golden/star decisivo)
  -> paused
  -> awaiting_set_service_order (nuevo set normal)
  -> finished
  -> cancelled

awaiting_receiver_side
  -> playing                (lado elegido; el siguiente punto decide)
  -> paused

paused
  -> estado anterior permitido
  -> cancelled

finished
  -> playing / awaiting_receiver_side (solo al deshacer el punto final)

cancelled
  -> terminal
```

El estado debe guardar `resumeStatus` al pausar. No se aceptan transiciones que no estén enumeradas.

---

## 7. Modelo de dominio TypeScript

Usar tipos nominales ligeros para no intercambiar IDs por accidente.

```ts
export type Brand<T, B extends string> = T & { readonly __brand: B };
export type PlayerId = Brand<string, "PlayerId">;
export type TeamId = Brand<string, "TeamId">;
export type MatchId = Brand<string, "MatchId">;
export type EventId = Brand<string, "EventId">;
export type ISODateTime = Brand<string, "ISODateTime">;
export type Side = "A" | "B";
export type CourtSide = "right" | "left";

export interface Player {
  id: PlayerId;
  name: string;
  normalizedName: string;
  sportGender: "male" | "female" | "unspecified";
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  archivedAt: ISODateTime | null;
}

export interface Team {
  id: TeamId;
  playerIds: readonly [PlayerId, PlayerId];
  canonicalKey: string; // IDs ordenados lexicográficamente y unidos
  displayName: string | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  archivedAt: ISODateTime | null;
}

export interface PlayerSnapshot {
  id: PlayerId;
  name: string;
  sportGender: Player["sportGender"];
}

export interface TeamSnapshot {
  sourceTeamId: TeamId;
  players: readonly [PlayerSnapshot, PlayerSnapshot];
  displayName: string | null;
}

export interface PointState {
  raw: readonly [number, number];
  deuceStage:
    | "none"
    | "deuce"
    | "advantage_a"
    | "advantage_b"
    | "deuce_1"
    | "advantage_1_a"
    | "advantage_1_b"
    | "deuce_2"
    | "advantage_2_a"
    | "advantage_2_b"
    | "deuce_3_star";
}

export interface SetState {
  index: number;
  kind: "normal" | "super_tiebreak";
  games: readonly [number, number];
  tieBreakPoints: readonly [number, number] | null;
  winner: Side | null;
  completedAtSequence: number | null;
}

export interface ServiceState {
  setIndex: number;
  order: readonly [PlayerId, PlayerId, PlayerId, PlayerId] | null;
  firstServingSide: Side;
  currentGameServerIndex: number;
  tieBreakFirstServerIndex: number | null;
  tieBreakPointsPlayed: number;
  nextSetFirstServingSide: Side | null;
}

export interface ReceiverDecision {
  receivingSide: Side;
  courtSide: CourtSide;
  receiverPlayerId: PlayerId | null;
  reason: "golden_point" | "star_point";
}

export interface MatchState {
  matchId: MatchId;
  status: MatchStatus;
  resumeStatus: Exclude<MatchStatus, "paused"> | null;
  rules: Readonly<MatchRules>;
  teams: Readonly<{ A: TeamSnapshot; B: TeamSnapshot }>;
  sets: readonly SetState[];
  setsWon: readonly [number, number];
  currentPoints: PointState;
  service: ServiceState;
  pendingReceiverDecision: ReceiverDecision | null;
  winner: Side | null;
  lastAppliedSequence: number;
  sideChangeDue: boolean;
}
```

No usar clases mutables. Las funciones del motor reciben estado y comando/evento y devuelven un objeto nuevo.

---

## 8. Comandos, eventos y reducer

### 8.1 Comandos de aplicación

Los comandos expresan intención y pueden fallar por validación.

```ts
export type MatchCommand =
  | { type: "START_MATCH"; firstServingSide: Side }
  | {
      type: "CONFIGURE_SET_SERVICE";
      setIndex: number;
      firstServerId: PlayerId;
      otherTeamFirstServerId: PlayerId;
    }
  | { type: "CHOOSE_RECEIVER"; courtSide: CourtSide; receiverPlayerId?: PlayerId }
  | { type: "AWARD_POINT"; winner: Side }
  | { type: "PAUSE_MATCH" }
  | { type: "RESUME_MATCH" }
  | { type: "CANCEL_MATCH"; reason?: string }
  | { type: "UNDO_LAST_POINT" };
```

### 8.2 Eventos persistidos

```ts
export interface EventMeta {
  id: EventId;
  matchId: MatchId;
  sequence: number;
  occurredAt: ISODateTime;
  schemaVersion: 1;
}

export type MatchEvent =
  | (EventMeta & {
      type: "MATCH_STARTED";
      firstServingSide: Side;
    })
  | (EventMeta & {
      type: "SET_SERVICE_ORDER_CONFIGURED";
      setIndex: number;
      order: readonly [PlayerId, PlayerId, PlayerId, PlayerId];
    })
  | (EventMeta & {
      type: "RECEIVER_SIDE_CHOSEN";
      courtSide: CourtSide;
      receiverPlayerId: PlayerId | null;
      reason: "golden_point" | "star_point";
    })
  | (EventMeta & {
      type: "POINT_AWARDED";
      winner: Side;
    })
  | (EventMeta & { type: "MATCH_PAUSED" })
  | (EventMeta & { type: "MATCH_RESUMED" })
  | (EventMeta & { type: "MATCH_CANCELLED"; reason: string | null })
  | (EventMeta & {
      type: "EVENT_REVERTED";
      targetEventId: EventId;
      targetSequence: number;
    });
```

No es necesario persistir `GAME_WON`, `SET_WON` ni `MATCH_FINISHED`: son hechos derivados por el reducer a partir de `POINT_AWARDED`. Esto evita duplicidades y estados imposibles.

### 8.3 Funciones públicas del dominio

```ts
export function createInitialState(input: CreateMatchInput): MatchState;
export function decide(state: MatchState, command: MatchCommand): DomainResult<MatchEvent[]>;
export function evolve(state: MatchState, event: MatchEvent): MatchState;
export function replay(initial: MatchState, events: readonly MatchEvent[]): MatchState;
export function awardPoint(state: MatchState, winner: Side): MatchState;
export function validateServiceOrder(state: MatchState, order: readonly PlayerId[]): DomainResult<void>;
export function currentServer(state: MatchState): PlayerId | null;
export function displayScore(state: MatchState): DisplayScore;
export function isTieBreak(state: MatchState): boolean;
export function shouldChangeEnds(state: MatchState): boolean;
```

`decide` valida y produce eventos sin acceder a persistencia. El caso de uso abre una transacción, obtiene el siguiente `sequence`, añade metadatos, guarda eventos y actualiza snapshot/partido.

### 8.4 Deshacer

- Encontrar el último `POINT_AWARDED` activo.
- En la misma transacción crear `EVENT_REVERTED` apuntando a él.
- Si el punto tenía inmediatamente antes un `RECEIVER_SIDE_CHOSEN` que ya no es aplicable, revertir también esa decisión mediante un segundo `EVENT_REVERTED`, o dejarla fuera del replay activo según una función explícita `eventsEffectiveAt()`.
- Reconstruir desde el estado inicial usando solo eventos efectivos.
- Guardar el snapshot reconstruido.
- El historial de auditoría se conserva; nunca se borra físicamente un evento de partido.

---

## 9. Algoritmo del motor

Orden estricto al aplicar un punto:

1. Validar `status` y que el saque esté configurado.
2. Si se espera elección de receptor, rechazar `AWARD_POINT` hasta recibirla.
3. Determinar si el contexto es juego normal, tie-break o super tie-break.
4. Incrementar el punto de la pareja ganadora.
5. Resolver si termina juego/desempate.
6. Si termina juego normal, poner puntos a cero y avanzar el sacador.
7. Resolver si termina el set.
8. Si termina el set, incrementar `setsWon` y calcular quién sirve primero en el siguiente.
9. Resolver si termina el partido.
10. Si hay un nuevo set normal, crear el set y pasar a `awaiting_set_service_order`.
11. Si el siguiente set es super tie-break, preparar el orden de servicio del nuevo set antes de aceptar puntos.
12. Calcular aviso de cambio de lado.
13. Devolver un nuevo estado inmutable.

Helpers puros mínimos:

```ts
hasWonByTarget(scoreA, scoreB, target, minLead): Side | null
reduceAdvantagePoint(pointState, winner): PointTransition
reduceGoldenPoint(pointState, winner): PointTransition
reduceStarPoint(pointState, winner): PointTransition
hasWonNormalSet(games, rules): Side | null
hasWonTieBreak(points, target, minLead): Side | null
nextNormalServerIndex(index): number
tieBreakServerIndex(firstIndex, pointsPlayed): number
buildServiceOrder(input): [PlayerId, PlayerId, PlayerId, PlayerId]
opposite(side): Side
```

No codificar el marcador con cadenas (`"40"`, `"AD"`) dentro del motor. Las cadenas pertenecen al adaptador de presentación.

---

## 10. Persistencia local con IndexedDB

Usar Dexie. Base de datos: `padel-scorekeeper`; versión inicial: `1`.

### 10.1 Tablas

```ts
export interface MatchRecord {
  id: MatchId;
  status: MatchStatus;
  rules: MatchRules;
  teams: { A: TeamSnapshot; B: TeamSnapshot };
  initialState: MatchState;
  startedAt: ISODateTime | null;
  finishedAt: ISODateTime | null;
  cancelledAt: ISODateTime | null;
  winner: Side | null;
  updatedAt: ISODateTime;
  createdAt: ISODateTime;
}

export interface MatchSnapshotRecord {
  matchId: MatchId;
  state: MatchState;
  lastSequence: number;
  updatedAt: ISODateTime;
}

export interface AppSettingRecord {
  key: string;
  value: unknown;
  updatedAt: ISODateTime;
}
```

Esquema Dexie:

```ts
this.version(1).stores({
  players: "id, normalizedName, archivedAt, createdAt",
  teams: "id, &canonicalKey, archivedAt, createdAt, *playerIds",
  matches: "id, status, createdAt, startedAt, finishedAt, updatedAt",
  matchEvents: "id, &[matchId+sequence], matchId, type, occurredAt",
  matchSnapshots: "matchId, lastSequence, updatedAt",
  settings: "key, updatedAt",
});
```

### 10.2 Repositorios

El dominio solo conoce interfaces:

```ts
export interface PlayerRepository { /* CRUD, archive, search */ }
export interface TeamRepository { /* CRUD, findByCanonicalKey, archive */ }
export interface MatchRepository { /* create, get, list, updateDerivedFields */ }
export interface MatchEventRepository { /* append, listByMatch, getNextSequence */ }
export interface SnapshotRepository { /* get, put, delete */ }
```

Implementaciones en `infrastructure/database/dexie/repositories/`.

### 10.3 Transacción al anotar

En una única transacción Dexie de lectura/escritura:

1. Cargar partido, snapshot y eventos posteriores al snapshot si los hubiera.
2. Reconstruir el estado actual.
3. Ejecutar el comando.
4. Asignar IDs, secuencias y hora mediante dependencias inyectadas.
5. Añadir los eventos.
6. Evolucionar el estado.
7. Guardar snapshot y campos derivados del partido.
8. Confirmar.

Deshabilitar temporalmente los botones mientras la transacción está pendiente. No aplicar actualizaciones optimistas al marcador en el MVP.

### 10.4 Recuperación

- Al arrancar, buscar partidos `playing`, `paused`, `awaiting_receiver_side` o `awaiting_set_service_order`.
- Si existe uno, mostrar “Continuar partido”.
- Validar snapshot contra `lastSequence`.
- Si falta, está desfasado o no pasa la validación, reconstruir desde eventos y reemplazarlo.
- Si hay más de un partido activo por corrupción o importación, no elegir silenciosamente: mostrar una lista de recuperación.

### 10.5 Backup JSON

Formato:

```ts
interface BackupEnvelopeV1 {
  format: "padel-scorekeeper-backup";
  version: 1;
  exportedAt: ISODateTime;
  appVersion: string;
  data: {
    players: Player[];
    teams: Team[];
    matches: MatchRecord[];
    matchEvents: MatchEvent[];
    settings: AppSettingRecord[];
  };
  checksum: string;
}
```

La importación valida con Zod, comprueba referencias e IDs/sequence duplicados y muestra un resumen antes de escribir. Para el MVP, estrategia única: `replace_all`, con confirmación explícita y exportación de seguridad previa. Los snapshots no se exportan; se regeneran.

---

## 11. Arquitectura de aplicación

### Stack

- React + TypeScript en modo estricto.
- Vite.
- React Router.
- Tailwind CSS.
- Dexie para IndexedDB.
- Zod para límites de entrada, backup y migraciones.
- React Hook Form para formularios.
- Zustand solo para estado efímero de UI si resulta necesario; el partido persistido no vive como fuente de verdad en Zustand.
- `vite-plugin-pwa`/Workbox para manifest y service worker.
- Vitest + Testing Library + `fake-indexeddb`.
- Playwright para recorridos críticos.
- ESLint + Prettier.

Usar versiones estables compatibles en el momento de crear el proyecto y fijarlas en el lockfile. No depender de servicios externos, CDN ni fuentes remotas.

### Capas

```text
UI (React)
  -> casos de uso de aplicación
      -> dominio puro
      -> interfaces de repositorio
          -> adaptadores Dexie / IndexedDB
```

Reglas de dependencia:

- `domain` no importa de React, Dexie, navegador ni `features`.
- `application` importa de `domain` y puertos, no de componentes.
- `infrastructure` implementa puertos.
- `features` compone casos de uso y UI.
- Ningún componente escribe directamente en tablas Dexie.

### Estructura de carpetas

```text
padel-scorekeeper/
├─ public/
│  ├─ icons/
│  └─ offline.html
├─ src/
│  ├─ app/
│  │  ├─ App.tsx
│  │  ├─ router.tsx
│  │  ├─ providers.tsx
│  │  └─ routes.ts
│  ├─ domain/
│  │  ├─ common/
│  │  ├─ players/
│  │  ├─ teams/
│  │  ├─ matches/
│  │  │  ├─ commands.ts
│  │  │  ├─ engine.ts
│  │  │  ├─ events.ts
│  │  │  ├─ rules.ts
│  │  │  ├─ scoring/
│  │  │  ├─ service/
│  │  │  ├─ types.ts
│  │  │  └─ validation.ts
│  │  └─ statistics/
│  ├─ application/
│  │  ├─ ports/
│  │  ├─ players/
│  │  ├─ teams/
│  │  ├─ matches/
│  │  ├─ statistics/
│  │  └─ backup/
│  ├─ infrastructure/
│  │  ├─ database/dexie/
│  │  ├─ repositories/
│  │  ├─ pwa/
│  │  └─ export/
│  ├─ features/
│  │  ├─ home/
│  │  ├─ players/
│  │  ├─ teams/
│  │  ├─ match-create/
│  │  ├─ live-match/
│  │  ├─ match-history/
│  │  ├─ statistics/
│  │  └─ settings/
│  ├─ shared/
│  │  ├─ components/
│  │  ├─ hooks/
│  │  ├─ styles/
│  │  ├─ test/
│  │  └─ utils/
│  ├─ main.tsx
│  └─ vite-env.d.ts
├─ tests/
│  ├─ integration/
│  └─ e2e/
├─ docs/
│  └─ decisions.md
└─ package.json
```

---

## 12. Pantallas y navegación

Navegación inferior en móvil: `Inicio`, `Jugadores`, `Partidos`, `Estadísticas`. Ajustes desde el encabezado. Durante un partido en directo se oculta la navegación inferior para evitar toques accidentales.

### 12.1 Inicio `/`

- CTA principal “Nuevo partido”.
- Tarjeta “Continuar partido” si existe alguno activo.
- Últimos tres partidos finalizados.
- Resumen: partidos, jugadores y victorias más recientes.
- Estado offline visible de forma discreta.

### 12.2 Jugadores `/players`

- Búsqueda por nombre normalizado.
- Lista activos/archivados.
- Crear y editar nombre y sexo deportivo opcional.
- Archivar con confirmación; no borrar historial.
- Validar nombre con 1–60 caracteres una vez recortado.

### 12.3 Parejas `/teams`

- Lista con nombres de ambos integrantes y estadísticas resumidas.
- Crear seleccionando dos jugadores activos distintos.
- Si existe `canonicalKey`, reutilizar y avisar.
- Nombre opcional de pareja.
- Archivar sin alterar partidos históricos.

### 12.4 Crear partido `/matches/new`

Asistente de cuatro pasos:

1. Pareja A: elegir guardada o crear combinación.
2. Pareja B: igual, excluyendo jugadores ya elegidos.
3. Reglas: elegir preset y revisar resumen legible.
4. Saque inicial: pareja que sirve, primer sacador de cada pareja y confirmación.

Al confirmar se crea el partido y sus snapshots de participantes, se registra el inicio y se navega al directo.

### 12.5 Orden de saque entre sets `/matches/:id/service`

- Muestra qué pareja debe servir primero, sin posibilidad de cambiarla.
- Permite elegir cuál de sus dos jugadores sirve primero.
- Permite elegir el primer sacador de la otra pareja.
- Vista previa del orden de cuatro jugadores.
- Bloquea órdenes que no alternen equipos o repitan jugadores.

### 12.6 Partido en directo `/matches/:id/live`

Prioridad absoluta a uso con una mano:

- Encabezado: set actual, modo, estado y menú.
- Resumen de sets anteriores.
- Dos tarjetas grandes con pareja, puntos/juegos y botón “Punto”.
- Indicador claro del sacador junto a su nombre.
- Marcador especial para tie-break/super tie-break.
- Texto “Siguiente sacador” cuando ayude a anticipar la rotación.
- Botón “Deshacer” separado de los botones de punto.
- Pausar/reanudar en menú.
- Aviso de cambio de lado.
- Confirmación opcional configurable para evitar doble toque; por defecto se usa bloqueo de 350 ms y feedback háptico si existe.
- Si se llega a punto de oro o Star Point, aparece una hoja modal para elegir el lado de recepción antes de habilitar los botones de punto.
- Al terminar, modal de ganador y acceso al resumen; no hay botón manual “Finalizar”.

### 12.7 Historial `/matches`

- Pestañas: activos, finalizados, cancelados.
- Orden descendente por fecha.
- Resultado compacto por sets, parejas y modo de puntuación.
- Filtros por jugador y fecha.

### 12.8 Detalle `/matches/:id`

- Participantes históricos.
- Reglas usadas.
- Resultado por sets y tie-breaks.
- Ganador, duración, puntos totales y cronología básica.
- Sin edición del resultado en MVP.

### 12.9 Estadísticas `/statistics`

- Resumen global.
- Tabla por jugador: PJ, PG, PP, % victorias, sets y juegos a favor/en contra, puntos a favor/en contra.
- Tabla por pareja con las mismas métricas.
- Excluir cancelados y en curso.
- Mostrar `—` cuando el denominador sea cero.

### 12.10 Ajustes `/settings`

- Preset predeterminado.
- Exportar backup JSON.
- Importar backup con validación y confirmación.
- Versión de app, versión de base de datos y estado PWA.

---

## 13. Diseño móvil, accesibilidad y resiliencia

- Ancho objetivo desde 320 px; probar especialmente 360×800 y 390×844.
- Áreas táctiles mínimas de 48×48 px; botones de punto ocupan gran parte de cada mitad.
- Contraste WCAG AA, foco visible y navegación por teclado.
- No comunicar el estado solo con color: usar icono y texto.
- `aria-live="polite"` para cambios del marcador; evitar anuncios redundantes.
- Respetar `prefers-reduced-motion`.
- Soportar safe areas (`env(safe-area-inset-*)`).
- Mantener el marcador en portrait y landscape sin perder controles.
- Evitar scroll accidental en los dos botones principales.
- Feedback de guardado y errores con acciones recuperables.
- Capturar errores de almacenamiento lleno, transacción abortada y base bloqueada.

---

## 14. PWA y funcionamiento offline

- Manifest con `name`, `short_name`, colores, iconos 192/512 y `display: standalone`.
- Service worker generado por Workbox.
- Precaché del shell y assets con hash.
- Navegación con fallback a `index.html`; página offline de emergencia solo si el shell no está disponible.
- No cachear respuestas de servicios externos porque el MVP no los usa.
- Mostrar actualización disponible y aplicarla únicamente tras confirmación, nunca durante un punto sin avisar.
- Probar instalación y arranque en modo avión.
- Incluir `apple-touch-icon`, theme color y metadatos para iOS.

---

## 15. Estadísticas básicas

Calcular mediante funciones puras a partir de partidos finalizados y estados reconstruidos/snapshots validados.

```ts
export interface BasicStats {
  played: number;
  won: number;
  lost: number;
  winRate: number | null;
  setsFor: number;
  setsAgainst: number;
  gamesFor: number;
  gamesAgainst: number;
  pointsFor: number;
  pointsAgainst: number;
}
```

Reglas:

- Cada jugador hereda las métricas de la pareja con la que disputó el partido.
- Una pareja se identifica por `canonicalKey`, incluso si su nombre cambia.
- Un super tie-break cuenta como un set ganado/perdido, no como juegos.
- Sus puntos sí cuentan en puntos a favor/en contra.
- Tie-break normal: el set cuenta 7-6 en juegos y los puntos del tie-break solo se suman a puntos.
- Partidos cancelados o no terminados no cuentan.
- Porcentaje = `won / played * 100`, redondeado solo en presentación.

Preparación futura para Excel: exponer `buildStatisticsReport()` con DTOs tabulares sin depender de ExcelJS.

---

## 16. Estrategia de pruebas

### 16.1 Unitarias del dominio

Cobertura exhaustiva del motor, sin mocks de React ni IndexedDB.

Casos mínimos:

1. Estado inicial a cero y bloqueado hasta configurar saque.
2. Orden de servicio válido e inválido.
3. Juego a cero en cuatro puntos.
4. Ventaja: deuce → ventaja A → juego A.
5. Ventaja: deuce → ventaja A → deuce.
6. Punto de oro: 40-40 exige elección de lado; siguiente punto cierra.
7. Star: deuce 1 → ventaja 1 → juego.
8. Star: deuce 1 → ventaja 1 A → deuce 2 → ventaja 2 B → juego B.
9. Star completo: deuce 1 → ventaja 1 → deuce 2 → ventaja 2 → deuce 3/Star → punto decisivo.
10. Star Point no admite un punto antes de elegir lado.
11. Star Point no puede superar 11 puntos totales.
12. Set 6-0, 6-4 y 7-5.
13. En 5-5 no termina; en 6-5 tampoco; en 7-5 sí.
14. En 6-6 inicia tie-break.
15. Tie-break 7-0, 7-5, no termina 7-6, termina 8-6.
16. Secuencia de servidor `0,1,1,2,2,3,3,0,0`.
17. Cambio de lado cada 6 puntos de tie-break.
18. Tras tie-break, sirve primero la pareja que recibió el primer punto del tie-break.
19. Rotación de sacador tras cada juego normal.
20. El orden puede redefinirse entre sets solo respetando la pareja servidora.
21. Mejor de 3 termina al ganar 2 sets; mejor de 5, al ganar 3.
22. Set decisivo como super tie-break a 10 con diferencia de 2.
23. No se anotan puntos pausado/terminado/cancelado.
24. Deshacer punto normal restaura exactamente el estado previo.
25. Deshacer el punto que cerró juego, set y partido reabre correctamente.
26. Replay produce el mismo estado que aplicación incremental.
27. Inmutabilidad: el estado de entrada no se modifica.
28. Pruebas basadas en propiedades: nunca hay marcadores negativos, un solo ganador, secuencias válidas y replay determinista.

Ejemplo orientativo:

```ts
describe("Star Point FIP 2026", () => {
  it("alcanza el punto decisivo tras dos ventajas devueltas", () => {
    let state = atDeuce(createPlayingMatch({ deuceMode: "star_point" }));
    state = awardPoint(state, "A"); // advantage 1 A
    state = awardPoint(state, "B"); // deuce 2
    state = awardPoint(state, "B"); // advantage 2 B
    state = awardPoint(state, "A"); // deuce 3 / Star

    expect(state.status).toBe("awaiting_receiver_side");
    expect(state.currentPoints.deuceStage).toBe("deuce_3_star");
  });
});
```

### 16.2 Integración

- Repositorios Dexie con `fake-indexeddb`.
- Transacción de anotar punto actualiza evento, snapshot y partido.
- Fallo simulado revierte toda la transacción.
- Índice compuesto impide dos secuencias iguales.
- Recuperación desde eventos cuando falta snapshot.
- Recuperación cuando snapshot está atrasado.
- Backup round-trip conserva datos y reconstruye estados.
- Importación rechaza referencias rotas y esquema desconocido.
- Estadísticas coinciden con una colección de partidos conocida.

### 16.3 Componentes

- Formularios y mensajes de validación.
- Exclusión de jugadores ya seleccionados.
- Botones de punto deshabilitados durante guardado.
- Diálogo de receptor en golden/Star.
- Indicador del sacador correcto.
- Accesibilidad con consultas por rol y nombre.

### 16.4 E2E con Playwright

Recorridos obligatorios:

1. Crear cuatro jugadores → dos parejas → partido → jugar hasta terminar → ver historial y estadísticas.
2. Cerrar/recargar en mitad del partido → continuar sin perder un punto.
3. Llegar a Star Point → elegir lado → cerrar juego.
4. Llegar a tie-break → validar rotación visible → terminar set.
5. Deshacer el punto final → continuar → terminar de nuevo.
6. Exportar backup → borrar datos mediante utilidad de prueba → importar → recuperar.
7. Instalar/servir build, pasar a offline y abrir partido existente.

### 16.5 Calidad objetivo

- 100 % de ramas en `domain/matches/scoring` y `domain/matches/service`.
- ≥ 90 % de líneas en todo `domain`.
- No perseguir cobertura artificial en componentes visuales; cubrir recorridos y riesgos.
- Cero errores de TypeScript, lint y pruebas antes de cerrar cada fase.

---

## 17. Criterios de aceptación del MVP

### Jugadores y parejas

- Se puede crear, editar, buscar y archivar un jugador.
- Se puede crear una pareja con dos jugadores distintos.
- No se duplica la misma pareja por invertir el orden.
- Archivar no rompe partidos históricos.

### Creación de partido

- No se puede iniciar con menos de cuatro jugadores distintos.
- Las reglas se validan y se copian al partido.
- Se puede elegir la pareja y jugador que sacan primero.
- El orden mostrado alterna parejas.

### Marcador

- Los tres modos de deuce funcionan según la sección 4.
- Star Point implementa exactamente dos ciclos de ventaja y luego un punto decisivo.
- El marcador calcula automáticamente juegos, sets y ganador.
- Tie-break y super tie-break exigen diferencia de dos.
- El sacador mostrado coincide con la secuencia reglamentaria.
- No se aceptan toques duplicados mientras se guarda.
- Deshacer restaura el estado exacto anterior, incluso tras finalizar.

### Persistencia

- Tras forzar cierre o recargar no se pierde el último punto confirmado.
- Un snapshot corrupto o ausente se regenera desde eventos.
- La aplicación funciona sin red después de su primera carga.
- Backup e importación round-trip mantienen la información.

### Estadísticas

- Solo cuentan partidos terminados.
- Jugadores y parejas muestran PJ, PG, PP, porcentaje, sets, juegos y puntos.
- Los totales coinciden con los detalles de partido.

### Calidad y UX

- El recorrido principal cabe y es operable a 360 px de ancho.
- Controles principales tienen al menos 48 px.
- Flujo principal es usable por teclado y lector de pantalla.
- `npm run build`, `npm run typecheck`, `npm run lint`, `npm test` y `npm run test:e2e` pasan.
- Lighthouse sobre build de producción: PWA instalable y objetivos orientativos ≥ 90 en accesibilidad y buenas prácticas.

---

## 18. Fases de implementación

Cada fase termina con código funcionando, pruebas, una actualización breve de `README.md` y un commit lógico si el entorno usa Git. No comenzar la siguiente si las comprobaciones de la actual fallan.

### Fase 0 — Arranque y guardarraíles

- Crear Vite React TypeScript.
- Configurar strict TS, alias, lint, format, Vitest y Playwright.
- Configurar Tailwind, router y estructura.
- Añadir scripts de calidad y CI.
- Añadir `docs/decisions.md`.

Salida: shell navegable y pipeline verde.

### Fase 1 — Dominio de puntuación y servicio

- Implementar tipos, validación de reglas, presets y máquina de estados.
- Implementar los tres modos de deuce.
- Implementar sets, tie-breaks, super tie-break y servicio.
- Implementar replay y deshacer lógico.
- Completar pruebas unitarias y de propiedades.

Salida: motor puro exhaustivamente probado, sin UI ni base de datos.

### Fase 2 — IndexedDB y casos de uso

- Implementar esquema Dexie y repositorios.
- Implementar transacciones de comandos/eventos/snapshots.
- CRUD de jugadores y parejas.
- Recuperación y reparación de snapshots.
- Pruebas con `fake-indexeddb`.

Salida: todos los casos de uso funcionan desde pruebas de integración.

### Fase 3 — UI de gestión y creación

- Layout móvil, navegación y componentes base.
- Pantallas de jugadores y parejas.
- Asistente de partido y configuración de saque.
- Validación accesible.

Salida: se crea un partido válido desde el móvil.

### Fase 4 — Marcador en directo

- Vista live, botones, marcador, sacador y sets.
- Diálogo de recepción para golden/Star.
- Pausa, reanudación, deshacer, cambios de lado y final.
- Recuperación desde Inicio.
- Pruebas de componentes y E2E críticos.

Salida: partido completo jugable y recuperable.

### Fase 5 — Historial, estadísticas y backup

- Lista y detalle de partidos.
- Agregadores de estadísticas.
- Pantallas de estadísticas.
- Exportación/importación JSON.

Salida: ciclo completo de datos local.

### Fase 6 — PWA, accesibilidad y endurecimiento

- Manifest, iconos, service worker y actualización segura.
- Offline E2E.
- Manejo de errores de almacenamiento y estados corruptos.
- Auditoría responsive, accesibilidad y rendimiento.
- README de instalación, ejecución y backup.

Salida: MVP instalable que cumple todos los criterios.

---

## 19. Convenciones para Codex

- Leer este documento completo antes de cambiar archivos.
- Inspeccionar el repositorio y preservar decisiones o cambios del usuario.
- Trabajar en incrementos pequeños; no crear toda la aplicación en un único cambio opaco.
- No dejar `TODO` en lógica deportiva entregada.
- No duplicar lógica de puntuación en componentes.
- No usar `any`; usar `unknown` y validación en límites.
- Inyectar reloj y generador de IDs en casos de uso para pruebas deterministas.
- Preferir funciones puras y discriminated unions.
- Cada corrección de una regla debe incluir una prueba de regresión.
- Si una fase revela una contradicción real, detenerse, documentarla y pedir decisión; no inventar una nueva regla deportiva.
- Mantener un resumen de progreso en `docs/implementation-status.md` con criterios cumplidos y pendientes.

Scripts esperados:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "format:check": "prettier --check .",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "check": "npm run typecheck && npm run lint && npm run format:check && npm test && npm run build"
  }
}
```

---

## 20. Prompts de ejecución para Codex

Ejecutar los prompts en orden. En cada uno, Codex debe inspeccionar primero el estado real del repositorio, implementar solo el alcance indicado, correr validaciones y resumir archivos cambiados, pruebas y riesgos pendientes.

### Prompt 1 — Inicialización

```text
Lee por completo PLAN_IMPLEMENTACION_PWA_MARCADOR_PADEL.md. Inspecciona el repositorio y ejecuta la Fase 0. Crea el proyecto React + TypeScript + Vite si aún no existe; configura TypeScript estricto, Tailwind, React Router, ESLint, Prettier, Vitest, Testing Library y Playwright; crea la estructura de carpetas y un shell móvil accesible. No implementes todavía el motor ni IndexedDB. Añade README, docs/decisions.md y docs/implementation-status.md. Ejecuta typecheck, lint, tests y build, corrige todos los fallos y entrega un resumen verificable.
```

### Prompt 2 — Motor puro

```text
Usa PLAN_IMPLEMENTACION_PWA_MARCADOR_PADEL.md como especificación normativa. Implementa la Fase 1 completa en TypeScript puro: tipos, presets y validación; estados y transiciones; ventaja, punto de oro y Star Point FIP 2026 exacto; sets, tie-break, super tie-break; orden y rotación del saque; cambios de lado; eventos, replay y deshacer lógico. No importes React, Dexie ni APIs del navegador en domain. Añade todos los tests unitarios indicados, incluidas secuencia de saque, Star Point máximo y deshacer el punto final. Ejecuta el conjunto de calidad y no avances con UI ni persistencia.
```

### Prompt 3 — Persistencia y casos de uso

```text
Implementa la Fase 2 siguiendo el plan. Añade Dexie, esquema v1, puertos y repositorios; CRUD y archivado de jugadores/parejas; transacciones atómicas para comandos, eventos y snapshots; recuperación por replay y reparación de snapshots. Usa fake-indexeddb en integración. Inyecta reloj e IDs. No permitas que React acceda directamente a Dexie. Ejecuta typecheck, lint, pruebas y build; documenta cualquier decisión menor.
```

### Prompt 4 — Gestión y creación de partidos

```text
Implementa la Fase 3 con enfoque mobile-first y accesible: layout, navegación, Inicio, CRUD de jugadores, parejas sin duplicados, asistente de creación de partido, presets y configuración inicial de saque. Conecta solo mediante casos de uso. Impide cuatro jugadores repetidos y órdenes de servicio inválidos. Añade tests de componentes y un E2E que deje un partido listo para jugar. Valida a 360 px y ejecuta el conjunto de calidad.
```

### Prompt 5 — Marcador en directo

```text
Implementa la Fase 4. Construye el marcador móvil con botones grandes, sets/juegos/puntos, sacador actual, tie-break y super tie-break; integra el diálogo obligatorio de lado de recepción para golden y Star Point; pausa, reanudación, deshacer, avisos de cambio de lado, finalización automática y recuperación tras recarga. Deshabilita acciones durante transacciones y evita dobles toques. Añade los E2E críticos del plan, incluida finalización, recarga, Star Point, tie-break y deshacer el punto final. Corrige todo hasta que el conjunto de calidad pase.
```

### Prompt 6 — Historial, estadísticas y backup

```text
Implementa la Fase 5. Añade historial, detalle de partido, agregadores puros y estadísticas por jugador/pareja conforme al plan. Implementa backup JSON versionado con checksum, validación Zod, vista previa, exportación de seguridad y estrategia replace_all; regenera snapshots al importar. Añade pruebas de totales, exclusiones, super tie-break y round-trip de backup. Ejecuta todas las validaciones.
```

### Prompt 7 — PWA y cierre del MVP

```text
Implementa la Fase 6 y realiza una auditoría final contra todos los criterios de aceptación de PLAN_IMPLEMENTACION_PWA_MARCADOR_PADEL.md. Configura manifest, iconos, service worker, offline, actualización segura y metadatos iOS; endurece errores de almacenamiento; revisa responsive y accesibilidad; completa E2E offline y documentación. Ejecuta check y test:e2e sobre build de producción. Actualiza docs/implementation-status.md con una matriz de cada criterio: cumplido, prueba/evidencia y cualquier pendiente real. No declares finalizado el MVP mientras haya un criterio obligatorio sin verificar.
```

### Prompt 8 — Auditoría independiente

```text
Actúa como revisor final. No añadas funcionalidades. Compara el repositorio terminado, línea por línea funcional, con PLAN_IMPLEMENTACION_PWA_MARCADOR_PADEL.md. Busca especialmente errores en Star Point, secuencia de saque del tie-break, pareja que sirve al comenzar el siguiente set, deshacer tras finalizar, atomicidad IndexedDB, estadísticas y offline. Ejecuta pruebas; crea pruebas de regresión para cada defecto encontrado; corrige solo defectos confirmados. Entrega una tabla de criterios con evidencia concreta y riesgos residuales.
```

---

## 21. Definition of Done

El MVP está terminado únicamente cuando:

1. Todos los criterios de aceptación están verificados con prueba automatizada o evidencia manual registrada.
2. El motor reproduce correctamente los tres modos de puntuación, incluidos los estados exactos de Star Point.
3. Un partido completo puede jugarse, cerrarse, recuperarse, deshacerse y finalizarse sin red.
4. Los eventos persistidos permiten reconstrucción determinista.
5. Backup/restauración y estadísticas han sido probados con datos no triviales.
6. No hay fallos de typecheck, lint, unitarias, integración, E2E o build.
7. La aplicación es instalable y el recorrido principal es usable a 360 px y con teclado.
8. `README.md`, decisiones y estado de implementación reflejan el sistema real.

---

## 22. Referencia normativa

La implementación de Star Point de este documento sigue la Regla 1, opción Star Point, publicada por la Federación Internacional de Pádel para 2026: dos oportunidades de ventaja y, tras devolver ambas, un punto decisivo con elección del lado por la pareja restadora.

- FIP, Rules of Padel: https://www.padelfip.com/wp-content/uploads/2025/12/FIP_Rules-of-Padel-1.pdf
- FIP, explicación de Star Point: https://www.padelfip.com/es/2025/12/entre-innovacion-y-tradicion-llega-el-star-point-el-sistema-de-puntuacion-que-cautiva-a-todos/

Si una revisión futura del reglamento contradice este documento, no cambiar el comportamiento silenciosamente: crear una nueva versión de reglas (`schemaVersion`) para que los partidos históricos sigan siendo reproducibles.
