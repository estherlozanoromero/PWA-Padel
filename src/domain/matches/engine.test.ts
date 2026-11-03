import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  applyPoint,
  chooseReceiver,
  configureSetService,
  cancelMatch,
  createInitialState,
  pauseMatch,
  resumeMatch,
  startMatch,
} from '@/domain/matches/engine';
import { createRules } from '@/domain/matches/rules';
import { currentServer } from '@/domain/matches/service';
import {
  configureCurrentSet,
  createDraft,
  createPlayingMatch,
  ids,
  teams,
  winGame,
  winSetToLove,
} from '@/domain/matches/test/fixtures';
import { currentSet } from '@/domain/matches/types';

function reachDeuce(mode: 'advantage' | 'golden_point' | 'star_point') {
  let state = createPlayingMatch(mode);
  for (const winner of ['A', 'A', 'A', 'B', 'B', 'B'] as const) state = applyPoint(state, winner);
  return state;
}

describe('motor de partido', () => {
  it('inicia bloqueado hasta configurar un saque válido', () => {
    const started = startMatch(createDraft(), 'B');

    expect(started.status).toBe('awaiting_set_service_order');
    expect(() => applyPoint(started, 'A')).toThrow(/no acepta puntos/i);
    const playing = configureSetService(started, ids.b1, ids.a1);
    expect(playing.status).toBe('playing');
    expect(currentServer(playing)).toBe(ids.b1);
  });

  it('exige cuatro jugadores distintos', () => {
    expect(() =>
      createInitialState({
        matchId: ids.match,
        teams: {
          A: teams.A,
          B: { ...teams.B, players: [teams.B.players[0], teams.A.players[0]] },
        },
        rules: createRules('classic_best_of_3'),
      }),
    ).toThrow(/cuatro jugadores distintos/i);
  });

  it('rechaza reglas incoherentes y órdenes de saque con jugadores cruzados', () => {
    expect(() =>
      createInitialState({
        matchId: ids.match,
        teams,
        rules: { ...createRules('classic_best_of_3'), tieBreakAtGames: 3 },
      }),
    ).toThrow(/reglas inválidas/i);

    const started = startMatch(createDraft(), 'A');
    expect(() => configureSetService(started, ids.b1, ids.a1)).toThrow(/orden de saque/i);
  });

  it('rota el sacador únicamente después de cerrar el juego', () => {
    let state = createPlayingMatch();
    const firstServer = currentServer(state);
    state = applyPoint(state, 'A');
    expect(currentServer(state)).toBe(firstServer);
    state = applyPoint(state, 'A');
    state = applyPoint(state, 'A');
    state = applyPoint(state, 'A');
    expect(currentServer(state)).toBe(ids.b1);
    expect(currentSet(state).games).toEqual([1, 0]);
  });

  it('punto de oro exige elegir receptor y el siguiente punto cierra el juego', () => {
    let state = reachDeuce('golden_point');
    expect(state.status).toBe('awaiting_receiver_side');
    expect(() => applyPoint(state, 'A')).toThrow(/no acepta puntos/i);

    state = chooseReceiver(state, { courtSide: 'right', receiverPlayerId: ids.b1 });
    state = applyPoint(state, 'A');

    expect(currentSet(state).games).toEqual([1, 0]);
    expect(state.currentPoints.raw).toEqual([0, 0]);
  });

  it('Star Point completo tiene como máximo once puntos', () => {
    let state = reachDeuce('star_point');
    state = applyPoint(state, 'A');
    state = applyPoint(state, 'B');
    state = applyPoint(state, 'B');
    state = applyPoint(state, 'A');

    expect(state.status).toBe('awaiting_receiver_side');
    expect(state.currentPoints.deuceStage).toBe('deuce_3_star');
    expect(state.currentPoints.raw[0] + state.currentPoints.raw[1]).toBe(10);

    state = chooseReceiver(state, { courtSide: 'left', receiverPlayerId: ids.b1 });
    state = applyPoint(state, 'A');
    expect(currentSet(state).games).toEqual([1, 0]);
  });

  it('en mixto obliga a que receptor y sacador tengan el mismo sexo', () => {
    const state = reachDeuce('golden_point');
    expect(() => chooseReceiver(state, { courtSide: 'left', receiverPlayerId: ids.b2 })).toThrow(
      /mismo sexo/i,
    );
    expect(chooseReceiver(state, { courtSide: 'left', receiverPlayerId: ids.b1 }).status).toBe(
      'playing',
    );
  });

  it('un set continúa en 6-5 y termina en 7-5', () => {
    let state = createPlayingMatch();
    for (let game = 0; game < 5; game += 1) state = winGame(state, 'A');
    for (let game = 0; game < 5; game += 1) state = winGame(state, 'B');
    state = winGame(state, 'A');
    expect(state.status).toBe('playing');
    expect(currentSet(state).games).toEqual([6, 5]);
    state = winGame(state, 'A');
    expect(state.status).toBe('awaiting_set_service_order');
    expect(state.sets[0]?.games).toEqual([7, 5]);
    expect(state.setsWon).toEqual([1, 0]);
  });

  it('sin tie-break continúa desde 6-6 hasta obtener dos juegos de diferencia', () => {
    const draft = createInitialState({
      matchId: ids.match,
      teams,
      rules: { ...createRules('classic_best_of_3'), tieBreakEnabled: false },
    });
    let state = configureCurrentSet(startMatch(draft, 'A'));
    for (let game = 0; game < 6; game += 1) {
      state = winGame(state, 'A');
      state = winGame(state, 'B');
    }
    expect(currentSet(state).games).toEqual([6, 6]);
    expect(currentSet(state).tieBreakPoints).toBeNull();
    state = winGame(state, 'A');
    state = winGame(state, 'A');
    expect(state.sets[0]?.games).toEqual([8, 6]);
    expect(state.setsWon).toEqual([1, 0]);
  });

  it('inicia tie-break en 6-6 y respeta la secuencia de saque', () => {
    let state = createPlayingMatch();
    for (let game = 0; game < 6; game += 1) {
      state = winGame(state, 'A');
      state = winGame(state, 'B');
    }

    expect(currentSet(state).tieBreakPoints).toEqual([0, 0]);
    const servers = [];
    for (let point = 0; point < 6; point += 1) {
      servers.push(currentServer(state));
      state = applyPoint(state, point % 2 === 0 ? 'A' : 'B');
    }
    expect(servers).toEqual([ids.a1, ids.b1, ids.b1, ids.a2, ids.a2, ids.b2]);
    expect(state.sideChangeDue).toBe(true);
  });

  it('el tie-break necesita diferencia de dos y cambia la pareja inicial del siguiente set', () => {
    let state = createPlayingMatch();
    for (let game = 0; game < 6; game += 1) {
      state = winGame(state, 'A');
      state = winGame(state, 'B');
    }
    for (const winner of [
      'A',
      'B',
      'A',
      'B',
      'A',
      'B',
      'A',
      'B',
      'A',
      'B',
      'A',
      'B',
      'A',
    ] as const) {
      state = applyPoint(state, winner);
    }
    expect(currentSet(state).tieBreakPoints).toEqual([7, 6]);
    expect(state.status).toBe('playing');
    state = applyPoint(state, 'A');

    expect(state.status).toBe('awaiting_set_service_order');
    expect(state.sets[0]?.games).toEqual([7, 6]);
    expect(state.service.firstServingSide).toBe('B');
  });

  it('termina el partido al ganar dos sets', () => {
    let state = winSetToLove(createPlayingMatch(), 'A');
    state = configureCurrentSet(state);
    state = winSetToLove(state, 'A');

    expect(state.status).toBe('finished');
    expect(state.winner).toBe('A');
    expect(state.setsWon).toEqual([2, 0]);
    expect(() => applyPoint(state, 'B')).toThrow(/no acepta puntos/i);
  });

  it('termina un partido de set único al ganar el primer set', () => {
    const draft = createInitialState({
      matchId: ids.match,
      teams,
      rules: createRules('classic_single_set'),
    });
    const state = winSetToLove(configureCurrentSet(startMatch(draft, 'A')), 'B');

    expect(state.status).toBe('finished');
    expect(state.winner).toBe('B');
    expect(state.setsWon).toEqual([0, 1]);
    expect(state.sets).toHaveLength(1);
  });

  it('un partido al mejor de cinco necesita tres sets', () => {
    const draft = createInitialState({
      matchId: ids.match,
      teams,
      rules: { ...createRules('classic_best_of_3'), bestOfSets: 5 },
    });
    let state = winSetToLove(configureCurrentSet(startMatch(draft, 'A')), 'B');
    state = configureCurrentSet(state);
    state = winSetToLove(state, 'B');
    expect(state.status).toBe('awaiting_set_service_order');
    state = configureCurrentSet(state);
    state = winSetToLove(state, 'B');
    expect(state.status).toBe('finished');
    expect(state.setsWon).toEqual([0, 3]);
  });

  it('usa un super tie-break como set decisivo', () => {
    let state = winSetToLove(createPlayingMatch('advantage', 'super_tiebreak'), 'A');
    state = configureCurrentSet(state);
    state = winSetToLove(state, 'B');

    expect(currentSet(state).kind).toBe('super_tiebreak');
    state = configureCurrentSet(state);
    for (let point = 0; point < 10; point += 1) state = applyPoint(state, 'A');

    expect(state.status).toBe('finished');
    expect(state.winner).toBe('A');
    expect(state.sets[2]?.tieBreakPoints).toEqual([10, 0]);
    expect(state.sets[2]?.games).toEqual([0, 0]);
  });

  it('pausa y reanuda conservando el estado anterior', () => {
    const playing = createPlayingMatch();
    const paused = pauseMatch(playing);
    expect(paused.status).toBe('paused');
    expect(() => applyPoint(paused, 'A')).toThrow();
    expect(resumeMatch(paused).status).toBe('playing');
  });

  it('cancela únicamente partidos no terminales', () => {
    const cancelled = cancelMatch(createPlayingMatch());
    expect(cancelled.status).toBe('cancelled');
    expect(() => cancelMatch(cancelled)).toThrow(/terminal/i);
  });

  it('no muta el estado de entrada al aplicar secuencias arbitrarias', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom('A' as const, 'B' as const), { maxLength: 40 }),
        (points) => {
          let state = createPlayingMatch();
          for (const winner of points) {
            if (state.status !== 'playing') break;
            const input = state;
            const snapshot = structuredClone(input);
            state = applyPoint(input, winner);
            expect(input).toEqual(snapshot);
            expect(input).not.toBe(state);
            expect(state.currentPoints.raw.every((value) => value >= 0)).toBe(true);
          }
        },
      ),
    );
  });
});
