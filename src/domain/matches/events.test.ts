import type { EventId } from '@/domain/common/types';
import { describe, expect, it } from 'vitest';
import { pauseMatch, startMatch } from '@/domain/matches/engine';
import {
  decide,
  effectiveEvents,
  evolve,
  replay,
  undoLastPoint,
  type StoredMatchEvent,
} from '@/domain/matches/events';
import { createDraft, createPlayingMatch, ids, stored } from '@/domain/matches/test/fixtures';

function baseHistory(): StoredMatchEvent[] {
  return [
    stored(1, { type: 'MATCH_STARTED', firstServingSide: 'A' }),
    stored(2, {
      type: 'SET_SERVICE_ORDER_CONFIGURED',
      order: [ids.a1, ids.b1, ids.a2, ids.b2],
    }),
  ];
}

describe('eventos, replay y deshacer', () => {
  it('decide rechaza puntos antes de configurar el saque', () => {
    const result = decide(createDraft(), { type: 'AWARD_POINT', winner: 'A' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('INVALID_STATUS');
  });

  it('decide los comandos válidos de inicio y saque', () => {
    expect(decide(createDraft(), { type: 'START_MATCH', firstServingSide: 'B' })).toEqual({
      ok: true,
      value: [{ type: 'MATCH_STARTED', firstServingSide: 'B' }],
    });

    const service = decide(startMatch(createDraft(), 'A'), {
      type: 'CONFIGURE_SET_SERVICE',
      firstServerId: ids.a2,
      otherTeamFirstServerId: ids.b2,
    });
    expect(service.ok && service.value[0]).toEqual({
      type: 'SET_SERVICE_ORDER_CONFIGURED',
      order: [ids.a2, ids.b2, ids.a1, ids.b1],
    });
  });

  it('rechaza repetir inicio y órdenes de saque inválidas', () => {
    const playing = createPlayingMatch();
    expect(decide(playing, { type: 'START_MATCH', firstServingSide: 'A' }).ok).toBe(false);
    expect(
      decide(playing, {
        type: 'CONFIGURE_SET_SERVICE',
        firstServerId: ids.a1,
        otherTeamFirstServerId: ids.b1,
      }).ok,
    ).toBe(false);
    const invalid = decide(startMatch(createDraft(), 'A'), {
      type: 'CONFIGURE_SET_SERVICE',
      firstServerId: ids.b1,
      otherTeamFirstServerId: ids.a1,
    });
    expect(!invalid.ok && invalid.error.code).toBe('INVALID_SERVICE_ORDER');
  });

  it('decide receptor y bloquea el punto decisivo hasta elegirlo', () => {
    let state = createPlayingMatch('golden_point');
    let sequence = 1;
    for (const winner of ['A', 'A', 'A', 'B', 'B', 'B'] as const) {
      state = evolve(state, stored(sequence, { type: 'POINT_AWARDED', winner }));
      sequence += 1;
    }
    const blocked = decide(state, { type: 'AWARD_POINT', winner: 'A' });
    expect(!blocked.ok && blocked.error.code).toBe('RECEIVER_CHOICE_REQUIRED');
    expect(
      decide(state, { type: 'CHOOSE_RECEIVER', courtSide: 'right', receiverPlayerId: ids.b2 }).ok,
    ).toBe(false);
    expect(
      decide(state, { type: 'CHOOSE_RECEIVER', courtSide: 'right', receiverPlayerId: ids.b1 }),
    ).toEqual({
      ok: true,
      value: [{ type: 'RECEIVER_SIDE_CHOSEN', courtSide: 'right', receiverPlayerId: ids.b1 }],
    });
  });

  it('decide puntos, pausa, reanudación y cancelación según el estado', () => {
    const playing = createPlayingMatch();
    expect(decide(playing, { type: 'AWARD_POINT', winner: 'B' })).toEqual({
      ok: true,
      value: [{ type: 'POINT_AWARDED', winner: 'B' }],
    });
    expect(decide(playing, { type: 'PAUSE_MATCH' })).toEqual({
      ok: true,
      value: [{ type: 'MATCH_PAUSED' }],
    });
    const paused = pauseMatch(playing);
    expect(decide(paused, { type: 'PAUSE_MATCH' }).ok).toBe(false);
    expect(decide(paused, { type: 'RESUME_MATCH' })).toEqual({
      ok: true,
      value: [{ type: 'MATCH_RESUMED' }],
    });
    expect(decide(playing, { type: 'RESUME_MATCH' }).ok).toBe(false);
    expect(decide(playing, { type: 'CANCEL_MATCH', reason: 'lluvia' })).toEqual({
      ok: true,
      value: [{ type: 'MATCH_CANCELLED', reason: 'lluvia' }],
    });
    const cancelled = evolve(playing, stored(1, { type: 'MATCH_CANCELLED', reason: null }));
    expect(decide(cancelled, { type: 'CANCEL_MATCH', reason: null }).ok).toBe(false);
  });

  it('evoluciona pausa, reanudación, receptor, cancelación y omite reversiones', () => {
    let state = createPlayingMatch();
    state = evolve(state, stored(1, { type: 'MATCH_PAUSED' }));
    state = evolve(state, stored(2, { type: 'MATCH_RESUMED' }));
    expect(state.status).toBe('playing');

    let golden = createPlayingMatch('golden_point');
    let sequence = 1;
    for (const winner of ['A', 'A', 'A', 'B', 'B', 'B'] as const) {
      golden = evolve(golden, stored(sequence, { type: 'POINT_AWARDED', winner }));
      sequence += 1;
    }
    golden = evolve(
      golden,
      stored(7, { type: 'RECEIVER_SIDE_CHOSEN', courtSide: 'left', receiverPlayerId: ids.b1 }),
    );
    expect(golden.receiverDecision?.courtSide).toBe('left');

    const cancelled = evolve(state, stored(3, { type: 'MATCH_CANCELLED', reason: null }));
    expect(cancelled.status).toBe('cancelled');
    const unchanged = evolve(
      state,
      stored(4, { type: 'EVENT_REVERTED', targetEventId: 'event-1' as EventId }),
    );
    expect(unchanged).toBe(state);
  });

  it('replay es determinista y respeta el orden de secuencia', () => {
    const events = [
      ...baseHistory(),
      stored(3, { type: 'POINT_AWARDED', winner: 'A' }),
      stored(4, { type: 'POINT_AWARDED', winner: 'A' }),
      stored(5, { type: 'POINT_AWARDED', winner: 'A' }),
      stored(6, { type: 'POINT_AWARDED', winner: 'A' }),
    ];
    const forward = replay(createDraft(), events);
    const shuffled = replay(createDraft(), [...events].reverse());

    expect(forward).toEqual(shuffled);
    expect(forward.sets[0]?.games).toEqual([1, 0]);
    expect(forward.lastAppliedSequence).toBe(6);
  });

  it('deshace el último punto sin borrar el historial', () => {
    const events = [
      ...baseHistory(),
      stored(3, { type: 'POINT_AWARDED', winner: 'A' }),
      stored(4, { type: 'POINT_AWARDED', winner: 'A' }),
      stored(5, { type: 'POINT_AWARDED', winner: 'A' }),
      stored(6, { type: 'POINT_AWARDED', winner: 'A' }),
    ];
    const plan = undoLastPoint(events);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    const revert = stored(7, {
      type: 'EVENT_REVERTED',
      targetEventId: plan.value.targetEventIds[0] as EventId,
    });
    const restored = replay(createDraft(), [...events, revert]);

    expect(restored.sets[0]?.games).toEqual([0, 0]);
    expect(restored.currentPoints.raw).toEqual([3, 0]);
    expect(restored.lastAppliedSequence).toBe(7);
    expect(events).toHaveLength(6);
  });

  it('informa cuando no hay puntos que deshacer', () => {
    const result = undoLastPoint(baseHistory());
    expect(!result.ok && result.error.code).toBe('NO_POINT_TO_UNDO');
  });

  it('filtra eventos revertidos y conserva los demás en orden', () => {
    const events = [
      ...baseHistory(),
      stored(3, { type: 'POINT_AWARDED', winner: 'A' }),
      stored(4, { type: 'POINT_AWARDED', winner: 'B' }),
      stored(5, { type: 'EVENT_REVERTED', targetEventId: 'event-3' as EventId }),
    ].reverse();
    expect(effectiveEvents(events).map((item) => item.id)).toEqual([
      'event-1',
      'event-2',
      'event-4',
    ]);
  });

  it('deshacer un punto decisivo también invalida la elección de receptor', () => {
    const events = [
      ...baseHistory(),
      ...(['A', 'A', 'A', 'B', 'B', 'B'] as const).map((winner, index) =>
        stored(index + 3, { type: 'POINT_AWARDED', winner }),
      ),
      stored(9, { type: 'RECEIVER_SIDE_CHOSEN', courtSide: 'right', receiverPlayerId: ids.b1 }),
      stored(10, { type: 'POINT_AWARDED', winner: 'A' }),
    ];

    const goldenDraft = createDraft('golden_point');
    expect(replay(goldenDraft, events).sets[0]?.games).toEqual([1, 0]);
    const plan = undoLastPoint(events);
    expect(plan.ok && plan.value.targetEventIds).toEqual([
      'event-10' as EventId,
      'event-9' as EventId,
    ]);
  });

  it('deshacer el punto final reabre el partido mediante replay', () => {
    let state = createDraft();
    const events: StoredMatchEvent[] = baseHistory();
    for (const item of events) state = evolve(state, item);
    let sequence = 3;

    for (let set = 0; set < 2; set += 1) {
      for (let game = 0; game < 6; game += 1) {
        for (let point = 0; point < 4; point += 1) {
          const item = stored(sequence, { type: 'POINT_AWARDED', winner: 'A' });
          events.push(item);
          state = evolve(state, item);
          sequence += 1;
        }
      }
      if (set === 0) {
        const order = stored(sequence, {
          type: 'SET_SERVICE_ORDER_CONFIGURED',
          order: [ids.a1, ids.b1, ids.a2, ids.b2],
        });
        events.push(order);
        state = evolve(state, order);
        sequence += 1;
      }
    }
    expect(state.status).toBe('finished');

    const plan = undoLastPoint(events);
    if (!plan.ok) throw new Error(plan.error.message);
    const revert = stored(sequence, {
      type: 'EVENT_REVERTED',
      targetEventId: plan.value.targetEventIds[0] as EventId,
    });
    const restored = replay(createDraft(), [...events, revert]);

    expect(restored.status).toBe('playing');
    expect(restored.winner).toBeNull();
    expect(restored.setsWon).toEqual([1, 0]);
    expect(restored.sets[1]?.games).toEqual([5, 0]);
    expect(restored.currentPoints.raw).toEqual([3, 0]);
  });
});
