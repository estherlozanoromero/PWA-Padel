import type { ISODateTime, PlayerId, TeamId } from '@/domain/common/types';

export interface Team {
  id: TeamId;
  playerIds: readonly [PlayerId, PlayerId];
  canonicalKey: string;
  displayName: string | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  archivedAt: ISODateTime | null;
}

export function canonicalTeamKey(playerIds: readonly [PlayerId, PlayerId]): string {
  return [...playerIds].sort((a, b) => a.localeCompare(b)).join('::');
}
