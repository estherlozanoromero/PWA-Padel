import type { CourtSide, MatchId, PlayerId, Side, TeamId } from '@/domain/common/types';
import type { MatchRules } from '@/domain/matches/rules';

export type MatchStatus =
  | 'draft'
  | 'awaiting_set_service_order'
  | 'playing'
  | 'awaiting_receiver_side'
  | 'paused'
  | 'finished'
  | 'cancelled';

export interface PlayerSnapshot {
  id: PlayerId;
  name: string;
  sportGender: 'male' | 'female' | 'unspecified';
}

export interface TeamSnapshot {
  sourceTeamId: TeamId;
  players: readonly [PlayerSnapshot, PlayerSnapshot];
  displayName: string | null;
}

export type DeuceStage =
  | 'none'
  | 'deuce'
  | 'advantage_a'
  | 'advantage_b'
  | 'deuce_1'
  | 'advantage_1_a'
  | 'advantage_1_b'
  | 'deuce_2'
  | 'advantage_2_a'
  | 'advantage_2_b'
  | 'deuce_3_star';

export interface PointState {
  raw: readonly [number, number];
  deuceStage: DeuceStage;
}

export interface SetState {
  index: number;
  kind: 'normal' | 'super_tiebreak';
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

export interface PendingReceiverChoice {
  receivingSide: Side;
  reason: 'golden_point' | 'star_point';
}

export interface ReceiverDecision extends PendingReceiverChoice {
  courtSide: CourtSide;
  receiverPlayerId: PlayerId | null;
}

export interface MatchState {
  matchId: MatchId;
  status: MatchStatus;
  resumeStatus: Exclude<MatchStatus, 'paused'> | null;
  rules: Readonly<MatchRules>;
  teams: Readonly<{ A: TeamSnapshot; B: TeamSnapshot }>;
  sets: readonly SetState[];
  setsWon: readonly [number, number];
  currentPoints: PointState;
  service: ServiceState;
  pendingReceiverChoice: PendingReceiverChoice | null;
  receiverDecision: ReceiverDecision | null;
  winner: Side | null;
  lastAppliedSequence: number;
  sideChangeDue: boolean;
}

export interface CreateMatchInput {
  matchId: MatchId;
  teams: Readonly<{ A: TeamSnapshot; B: TeamSnapshot }>;
  rules: Readonly<MatchRules>;
}

export type DomainErrorCode =
  | 'INVALID_RULES'
  | 'INVALID_STATUS'
  | 'INVALID_TEAMS'
  | 'INVALID_SERVICE_ORDER'
  | 'RECEIVER_CHOICE_REQUIRED'
  | 'INVALID_RECEIVER'
  | 'NO_POINT_TO_UNDO';

export interface DomainError {
  code: DomainErrorCode;
  message: string;
}

export type DomainResult<T> = { ok: true; value: T } | { ok: false; error: DomainError };

export const POINTS_ZERO: PointState = { raw: [0, 0], deuceStage: 'none' };

export function currentSet(state: MatchState): SetState {
  const set = state.sets[state.sets.length - 1];
  if (!set) throw new Error('El partido no contiene ningún set.');
  return set;
}
