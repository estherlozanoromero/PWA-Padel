import Dexie, { type Table } from 'dexie';
import type {
  GroupId,
  GroupMemberId,
  MatchId,
  PlayerId,
  RatingAdjustmentId,
  TeamId,
} from '@/domain/common/types';
import type { GroupMember, PlayerGroup, RatingAdjustment } from '@/domain/groups/types';
import type { Player } from '@/domain/players/types';
import type { Team } from '@/domain/teams/types';
import type {
  AppSettingRecord,
  MatchEventRecord,
  MatchRecord,
  MatchSnapshotRecord,
} from '@/infrastructure/database/dexie/records';

export const DATABASE_NAME = 'padel-scorekeeper';
export const DATABASE_VERSION = 2;

export class PadelDatabase extends Dexie {
  players!: Table<Player, PlayerId>;
  teams!: Table<Team, TeamId>;
  matches!: Table<MatchRecord, MatchId>;
  matchEvents!: Table<MatchEventRecord, string>;
  matchSnapshots!: Table<MatchSnapshotRecord, MatchId>;
  settings!: Table<AppSettingRecord, string>;
  groups!: Table<PlayerGroup, GroupId>;
  groupMembers!: Table<GroupMember, GroupMemberId>;
  ratingAdjustments!: Table<RatingAdjustment, RatingAdjustmentId>;

  constructor(name = DATABASE_NAME) {
    super(name);
    this.version(DATABASE_VERSION).stores({
      players: 'id, normalizedName, archivedAt, createdAt',
      teams: 'id, &canonicalKey, archivedAt, createdAt, *playerIds',
      matches: 'id, status, createdAt, startedAt, finishedAt, updatedAt',
      matchEvents: 'id, &[matchId+sequence], matchId, event.type, occurredAt',
      matchSnapshots: 'matchId, lastSequence, updatedAt',
      settings: 'key, updatedAt',
      groups: 'id, normalizedName, archivedAt, createdAt',
      groupMembers: 'id, groupId, playerId, &[groupId+playerId], kind, role, leftAt',
      ratingAdjustments: 'id, groupId, memberId, createdAt',
    });
  }
}

export const database = new PadelDatabase();
