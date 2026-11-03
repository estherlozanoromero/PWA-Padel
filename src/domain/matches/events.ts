import type {
  CourtSide,
  EventId,
  ISODateTime,
  MatchId,
  PlayerId,
  Side,
} from '@/domain/common/types';
import {
  applyPoint,
  cancelMatch,
  chooseReceiver,
  configureSetService,
  pauseMatch,
  resumeMatch,
  startMatch,
  validateReceiverDecision,
} from '@/domain/matches/engine';
import { buildServiceOrder, currentServer } from '@/domain/matches/service';
import type { DomainResult, MatchState } from '@/domain/matches/types';

export type MatchCommand =
  | { type: 'START_MATCH'; firstServingSide: Side }
  | {
      type: 'CONFIGURE_SET_SERVICE';
      firstServerId: PlayerId;
      otherTeamFirstServerId: PlayerId;
    }
  | { type: 'CHOOSE_RECEIVER'; courtSide: CourtSide; receiverPlayerId: PlayerId | null }
  | { type: 'AWARD_POINT'; winner: Side }
  | { type: 'PAUSE_MATCH' }
  | { type: 'RESUME_MATCH' }
  | { type: 'CANCEL_MATCH'; reason: string | null };

export type MatchEvent =
  | { type: 'MATCH_STARTED'; firstServingSide: Side }
  | {
      type: 'SET_SERVICE_ORDER_CONFIGURED';
      order: readonly [PlayerId, PlayerId, PlayerId, PlayerId];
    }
  | {
      type: 'RECEIVER_SIDE_CHOSEN';
      courtSide: CourtSide;
      receiverPlayerId: PlayerId | null;
    }
  | { type: 'POINT_AWARDED'; winner: Side }
  | { type: 'MATCH_PAUSED' }
  | { type: 'MATCH_RESUMED' }
  | { type: 'MATCH_CANCELLED'; reason: string | null }
  | { type: 'EVENT_REVERTED'; targetEventId: EventId };

export interface EventMeta {
  id: EventId;
  matchId: MatchId;
  sequence: number;
  occurredAt: ISODateTime;
  schemaVersion: 1;
}

export interface StoredMatchEvent extends EventMeta {
  event: MatchEvent;
}

function invalidStatus(message: string): DomainResult<never> {
  return { ok: false, error: { code: 'INVALID_STATUS', message } };
}

export function decide(
  state: MatchState,
  command: MatchCommand,
): DomainResult<readonly MatchEvent[]> {
  switch (command.type) {
    case 'START_MATCH':
      if (state.status !== 'draft') return invalidStatus('El partido ya se ha iniciado.');
      return {
        ok: true,
        value: [{ type: 'MATCH_STARTED', firstServingSide: command.firstServingSide }],
      };
    case 'CONFIGURE_SET_SERVICE': {
      if (state.status !== 'awaiting_set_service_order') {
        return invalidStatus('No se está esperando un orden de saque.');
      }
      const order = buildServiceOrder({
        teams: state.teams,
        firstServingSide: state.service.firstServingSide,
        firstServerId: command.firstServerId,
        otherTeamFirstServerId: command.otherTeamFirstServerId,
      });
      if (!order) {
        return {
          ok: false,
          error: { code: 'INVALID_SERVICE_ORDER', message: 'El orden de saque no es válido.' },
        };
      }
      return { ok: true, value: [{ type: 'SET_SERVICE_ORDER_CONFIGURED', order }] };
    }
    case 'CHOOSE_RECEIVER': {
      const validation = validateReceiverDecision(state, command.receiverPlayerId);
      if (!validation.ok) return validation;
      return {
        ok: true,
        value: [
          {
            type: 'RECEIVER_SIDE_CHOSEN',
            courtSide: command.courtSide,
            receiverPlayerId: command.receiverPlayerId,
          },
        ],
      };
    }
    case 'AWARD_POINT':
      if (state.status === 'awaiting_receiver_side') {
        return {
          ok: false,
          error: {
            code: 'RECEIVER_CHOICE_REQUIRED',
            message: 'Hay que elegir el lado de recepción antes del punto decisivo.',
          },
        };
      }
      if (state.status !== 'playing' || currentServer(state) === null) {
        return invalidStatus('El partido no acepta puntos ahora mismo.');
      }
      return { ok: true, value: [{ type: 'POINT_AWARDED', winner: command.winner }] };
    case 'PAUSE_MATCH':
      if (state.status !== 'playing' && state.status !== 'awaiting_receiver_side') {
        return invalidStatus('El partido no se puede pausar ahora mismo.');
      }
      return { ok: true, value: [{ type: 'MATCH_PAUSED' }] };
    case 'RESUME_MATCH':
      if (state.status !== 'paused') return invalidStatus('El partido no está pausado.');
      return { ok: true, value: [{ type: 'MATCH_RESUMED' }] };
    case 'CANCEL_MATCH':
      if (state.status === 'finished' || state.status === 'cancelled') {
        return invalidStatus('El partido ya está en un estado terminal.');
      }
      return {
        ok: true,
        value: [{ type: 'MATCH_CANCELLED', reason: command.reason }],
      };
  }
}

export function evolve(state: MatchState, stored: StoredMatchEvent): MatchState {
  const { event } = stored;
  let next: MatchState;

  switch (event.type) {
    case 'MATCH_STARTED':
      next = startMatch(state, event.firstServingSide);
      break;
    case 'SET_SERVICE_ORDER_CONFIGURED':
      next = configureSetService(state, event.order[0], event.order[1]);
      break;
    case 'RECEIVER_SIDE_CHOSEN':
      next = chooseReceiver(state, event);
      break;
    case 'POINT_AWARDED':
      next = applyPoint(state, event.winner);
      next = {
        ...next,
        sets: next.sets.map((set) =>
          set.winner && set.completedAtSequence === null
            ? { ...set, completedAtSequence: stored.sequence }
            : set,
        ),
      };
      break;
    case 'MATCH_PAUSED':
      next = pauseMatch(state);
      break;
    case 'MATCH_RESUMED':
      next = resumeMatch(state);
      break;
    case 'MATCH_CANCELLED':
      next = cancelMatch(state);
      break;
    case 'EVENT_REVERTED':
      return state;
  }

  return { ...next, lastAppliedSequence: stored.sequence };
}

export function effectiveEvents(events: readonly StoredMatchEvent[]): readonly StoredMatchEvent[] {
  const revertedIds = new Set(
    events
      .filter((item) => item.event.type === 'EVENT_REVERTED')
      .map((item) => (item.event as Extract<MatchEvent, { type: 'EVENT_REVERTED' }>).targetEventId),
  );

  return [...events]
    .sort((a, b) => a.sequence - b.sequence)
    .filter((item) => item.event.type !== 'EVENT_REVERTED' && !revertedIds.has(item.id));
}

export function replay(initialState: MatchState, events: readonly StoredMatchEvent[]): MatchState {
  const state = effectiveEvents(events).reduce(evolve, initialState);
  const lastSequence = events.reduce((highest, item) => Math.max(highest, item.sequence), 0);
  return { ...state, lastAppliedSequence: lastSequence };
}

export interface UndoPlan {
  targetEventIds: readonly EventId[];
}

export function undoLastPoint(events: readonly StoredMatchEvent[]): DomainResult<UndoPlan> {
  const effective = effectiveEvents(events);
  let pointIndex = -1;
  for (let index = effective.length - 1; index >= 0; index -= 1) {
    if (effective[index]?.event.type === 'POINT_AWARDED') {
      pointIndex = index;
      break;
    }
  }
  if (pointIndex < 0) {
    return {
      ok: false,
      error: { code: 'NO_POINT_TO_UNDO', message: 'No hay ningún punto que deshacer.' },
    };
  }

  const point = effective[pointIndex];
  if (!point) throw new Error('No se ha podido localizar el último punto.');
  const targetEventIds: EventId[] = [point.id];
  const previous = effective[pointIndex - 1];
  if (previous?.event.type === 'RECEIVER_SIDE_CHOSEN') targetEventIds.push(previous.id);

  return { ok: true, value: { targetEventIds } };
}
