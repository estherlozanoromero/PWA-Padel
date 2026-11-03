import type { MatchId, PlayerId, TeamId } from '@/domain/common/types';
import type { Player } from '@/domain/players/types';
import type { Team } from '@/domain/teams/types';
import type { StoredMatchEvent } from '@/domain/matches/events';
import type { MatchState, MatchStatus } from '@/domain/matches/types';
import type { MatchRecord, MatchSnapshotRecord } from '@/application/ports/records';

export interface PlayerRepository {
  get(id: PlayerId): Promise<Player | undefined>;
  list(includeArchived?: boolean): Promise<readonly Player[]>;
  search(normalizedQuery: string, includeArchived?: boolean): Promise<readonly Player[]>;
  put(player: Player): Promise<void>;
}

export interface TeamRepository {
  get(id: TeamId): Promise<Team | undefined>;
  findByCanonicalKey(canonicalKey: string): Promise<Team | undefined>;
  list(includeArchived?: boolean): Promise<readonly Team[]>;
  put(team: Team): Promise<void>;
}

export interface MatchRepository {
  get(id: MatchId): Promise<MatchRecord | undefined>;
  listByStatuses(statuses: readonly MatchStatus[]): Promise<readonly MatchRecord[]>;
  put(match: MatchRecord): Promise<void>;
}

export interface MatchEventRepository {
  listByMatch(matchId: MatchId): Promise<readonly StoredMatchEvent[]>;
  appendMany(events: readonly StoredMatchEvent[]): Promise<void>;
}

export interface SnapshotRepository {
  get(matchId: MatchId): Promise<MatchSnapshotRecord | undefined>;
  put(snapshot: MatchSnapshotRecord): Promise<void>;
  delete(matchId: MatchId): Promise<void>;
}

export interface MatchTransactionRepositories {
  matches: MatchRepository;
  events: MatchEventRepository;
  snapshots: SnapshotRepository;
}

export interface MatchUnitOfWork {
  run<T>(work: (repositories: MatchTransactionRepositories) => Promise<T>): Promise<T>;
}

export interface RecoveredMatch {
  record: MatchRecord;
  state: MatchState;
}
