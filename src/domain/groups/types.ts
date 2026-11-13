import type {
  GroupId,
  GroupMemberId,
  ISODateTime,
  PlayerId,
  RatingAdjustmentId,
  UserId,
} from '@/domain/common/types';

export interface GroupScoringRules {
  winPoints: number;
  lossPoints: number;
  initialElo: number;
  eloKFactor: number;
}

export const DEFAULT_GROUP_SCORING: GroupScoringRules = {
  winPoints: 3,
  lossPoints: 1,
  initialElo: 1000,
  eloKFactor: 32,
};

export interface PlayerGroup {
  id: GroupId;
  name: string;
  normalizedName: string;
  scoring: GroupScoringRules;
  ownerUserId: UserId | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  archivedAt: ISODateTime | null;
}

export type GroupRole = 'owner' | 'admin' | 'member';
export type MemberKind = 'account' | 'guest';

export interface GroupMember {
  id: GroupMemberId;
  groupId: GroupId;
  playerId: PlayerId;
  kind: MemberKind;
  role: GroupRole;
  accountUserId: UserId | null;
  joinedAt: ISODateTime;
  updatedAt?: ISODateTime;
  leftAt: ISODateTime | null;
}

export interface RatingAdjustment {
  id: RatingAdjustmentId;
  groupId: GroupId;
  memberId: GroupMemberId;
  pointsDelta: number;
  eloDelta: number;
  reason: string;
  createdByUserId: UserId | null;
  createdAt: ISODateTime;
}

export function normalizeGroupName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es');
}
