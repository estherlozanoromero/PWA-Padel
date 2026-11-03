import type { StoredMatchEvent } from '@/domain/matches/events';
export type {
  AppSettingRecord,
  MatchRecord,
  MatchSnapshotRecord,
} from '@/application/ports/records';

export type MatchEventRecord = StoredMatchEvent;
