import { describe, expect, it } from 'vitest';
import {
  buildServiceOrder,
  currentServer,
  playerSide,
  tieBreakServerIndex,
  validateServiceOrder,
} from '@/domain/matches/service';
import { createPlayingMatch, ids, teams } from '@/domain/matches/test/fixtures';

describe('orden de servicio', () => {
  it('construye un orden circular que alterna parejas', () => {
    const order = buildServiceOrder({
      teams,
      firstServingSide: 'A',
      firstServerId: ids.a2,
      otherTeamFirstServerId: ids.b1,
    });

    expect(order).toEqual([ids.a2, ids.b1, ids.a1, ids.b2]);
    expect(order && validateServiceOrder(teams, 'A', order)).toBe(true);
  });

  it('admite cualquiera de los dos integrantes y cualquiera de las dos parejas primero', () => {
    expect(
      buildServiceOrder({
        teams,
        firstServingSide: 'B',
        firstServerId: ids.b2,
        otherTeamFirstServerId: ids.a2,
      }),
    ).toEqual([ids.b2, ids.a2, ids.b1, ids.a1]);
  });

  it('rechaza jugadores que no pertenecen a la pareja correspondiente', () => {
    expect(
      buildServiceOrder({
        teams,
        firstServingSide: 'A',
        firstServerId: ids.b1,
        otherTeamFirstServerId: ids.b2,
      }),
    ).toBeNull();
    expect(
      buildServiceOrder({
        teams,
        firstServingSide: 'A',
        firstServerId: ids.a1,
        otherTeamFirstServerId: ids.a2,
      }),
    ).toBeNull();
  });

  it('rechaza órdenes con jugadores repetidos o parejas consecutivas', () => {
    expect(validateServiceOrder(teams, 'A', [ids.a1, ids.b1, ids.a2])).toBe(false);
    expect(validateServiceOrder(teams, 'A', [ids.a1, ids.a2, ids.b1, ids.b2])).toBe(false);
    expect(validateServiceOrder(teams, 'A', [ids.a1, ids.b1, ids.a1, ids.b2])).toBe(false);
  });

  it('identifica la pareja de un jugador', () => {
    expect(playerSide(teams, ids.a2)).toBe('A');
    expect(playerSide(teams, ids.b2)).toBe('B');
    expect(playerSide(teams, 'outsider' as typeof ids.a1)).toBeNull();
  });

  it('calcula la secuencia 1-2-2 del tie-break', () => {
    expect(Array.from({ length: 9 }, (_, point) => tieBreakServerIndex(0, point))).toEqual([
      0, 1, 1, 2, 2, 3, 3, 0, 0,
    ]);
  });

  it('expone el sacador del juego actual', () => {
    expect(currentServer(createPlayingMatch())).toBe(ids.a1);
  });

  it('devuelve null cuando el estado todavía no permite calcular sacador', () => {
    const playing = createPlayingMatch();
    expect(currentServer({ ...playing, service: { ...playing.service, order: null } })).toBeNull();
    expect(currentServer({ ...playing, sets: [] })).toBeNull();
    expect(
      currentServer({
        ...playing,
        sets: [{ ...playing.sets[0]!, tieBreakPoints: [0, 0] }],
        service: { ...playing.service, tieBreakFirstServerIndex: null },
      }),
    ).toBeNull();
  });

  it('calcula el sacador tanto en tie-break normal como en super tie-break', () => {
    const playing = createPlayingMatch();
    const tieBreak = {
      ...playing,
      sets: [{ ...playing.sets[0]!, tieBreakPoints: [1, 1] as const }],
      service: { ...playing.service, tieBreakFirstServerIndex: 0, tieBreakPointsPlayed: 2 },
    };
    expect(currentServer(tieBreak)).toBe(ids.b1);
    expect(
      currentServer({
        ...tieBreak,
        sets: [{ ...tieBreak.sets[0]!, kind: 'super_tiebreak' as const, tieBreakPoints: [1, 1] }],
      }),
    ).toBe(ids.b1);
    expect(
      currentServer({
        ...playing,
        service: { ...playing.service, currentGameServerIndex: 99 },
      }),
    ).toBeNull();
  });
});
