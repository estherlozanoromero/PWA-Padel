import type { EventId, ISODateTime, MatchId, PlayerId, TeamId } from '@/domain/common/types';
import {
  applyPoint,
  configureSetService,
  createInitialState,
  startMatch,
} from '@/domain/matches/engine';
import type { EventMeta, MatchEvent, StoredMatchEvent } from '@/domain/matches/events';
import { createRules, type DecidingSetMode, type DeuceMode } from '@/domain/matches/rules';
import type { MatchState, TeamSnapshot } from '@/domain/matches/types';

export const ids = {
  match: 'match-1' as MatchId,
  a1: 'a1' as PlayerId,
  a2: 'a2' as PlayerId,
  b1: 'b1' as PlayerId,
  b2: 'b2' as PlayerId,
};

export const teams: Readonly<{ A: TeamSnapshot; B: TeamSnapshot }> = {
  A: {
    sourceTeamId: 'team-a' as TeamId,
    displayName: 'Verdes',
    players: [
      { id: ids.a1, name: 'Ana', sportGender: 'female' },
      { id: ids.a2, name: 'Álex', sportGender: 'male' },
    ],
  },
  B: {
    sourceTeamId: 'team-b' as TeamId,
    displayName: 'Azules',
    players: [
      { id: ids.b1, name: 'Bea', sportGender: 'female' },
      { id: ids.b2, name: 'Bruno', sportGender: 'male' },
    ],
  },
};

export function createDraft(
  deuceMode: DeuceMode = 'advantage',
  decidingSetMode: DecidingSetMode = 'normal_set',
): MatchState {
  const rules = createRules('classic_best_of_3');
  return createInitialState({
    matchId: ids.match,
    teams,
    rules: { ...rules, deuceMode, decidingSetMode },
  });
}

export function configureCurrentSet(state: MatchState): MatchState {
  const firstSide = state.service.firstServingSide;
  return configureSetService(
    state,
    firstSide === 'A' ? ids.a1 : ids.b1,
    firstSide === 'A' ? ids.b1 : ids.a1,
  );
}

export function createPlayingMatch(
  deuceMode: DeuceMode = 'advantage',
  decidingSetMode: DecidingSetMode = 'normal_set',
): MatchState {
  return configureCurrentSet(startMatch(createDraft(deuceMode, decidingSetMode), 'A'));
}

export function winGame(state: MatchState, winner: 'A' | 'B'): MatchState {
  let next = state;
  for (let point = 0; point < 4; point += 1) next = applyPoint(next, winner);
  return next;
}

export function winSetToLove(state: MatchState, winner: 'A' | 'B'): MatchState {
  let next = state;
  for (let game = 0; game < 6; game += 1) next = winGame(next, winner);
  return next;
}

export function eventMeta(sequence: number): EventMeta {
  return {
    id: `event-${sequence}` as EventId,
    matchId: ids.match,
    sequence,
    occurredAt: `2026-11-03T12:${String(sequence).padStart(2, '0')}:00.000Z` as ISODateTime,
    schemaVersion: 1,
  };
}

export function stored(sequence: number, event: MatchEvent): StoredMatchEvent {
  return { ...eventMeta(sequence), event };
}
