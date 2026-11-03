import type { ISODateTime, MatchId } from '@/domain/common/types';
import type { MatchRules } from '@/domain/matches/rules';
import type { MatchState, MatchStatus, TeamSnapshot } from '@/domain/matches/types';

export interface MatchRecord {
  id: MatchId;
  status: MatchStatus;
  rules: MatchRules;
  teams: { A: TeamSnapshot; B: TeamSnapshot };
  initialState: MatchState;
  startedAt: ISODateTime | null;
  finishedAt: ISODateTime | null;
  cancelledAt: ISODateTime | null;
  winner: 'A' | 'B' | null;
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
