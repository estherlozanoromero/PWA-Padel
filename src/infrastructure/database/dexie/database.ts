import Dexie, { type Table } from 'dexie';
import type { MatchId, PlayerId, TeamId } from '@/domain/common/types';
import type { Player } from '@/domain/players/types';
import type { Team } from '@/domain/teams/types';
import type {
  AppSettingRecord,
  MatchEventRecord,
  MatchRecord,
  MatchSnapshotRecord,
} from '@/infrastructure/database/dexie/records';

export const DATABASE_NAME = 'padel-scorekeeper';
export const DATABASE_VERSION = 1;

export class PadelDatabase extends Dexie {
  players!: Table<Player, PlayerId>;
  teams!: Table<Team, TeamId>;
  matches!: Table<MatchRecord, MatchId>;
  matchEvents!: Table<MatchEventRecord, string>;
  matchSnapshots!: Table<MatchSnapshotRecord, MatchId>;
  settings!: Table<AppSettingRecord, string>;

  constructor(name = DATABASE_NAME) {
    super(name);
    this.version(DATABASE_VERSION).stores({
      players: 'id, normalizedName, archivedAt, createdAt',
      teams: 'id, &canonicalKey, archivedAt, createdAt, *playerIds',
      matches: 'id, status, createdAt, startedAt, finishedAt, updatedAt',
      matchEvents: 'id, &[matchId+sequence], matchId, event.type, occurredAt',
      matchSnapshots: 'matchId, lastSequence, updatedAt',
      settings: 'key, updatedAt',
    });
  }
}

export const database = new PadelDatabase();
