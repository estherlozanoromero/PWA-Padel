import { describe, expect, it } from 'vitest';
import type {
  GroupId,
  GroupMemberId,
  ISODateTime,
  PlayerId,
  RatingAdjustmentId,
} from '@/domain/common/types';
import { buildGroupRanking } from '@/domain/groups/ranking';
import {
  DEFAULT_GROUP_SCORING,
  type GroupMember,
  type RatingAdjustment,
} from '@/domain/groups/types';
import {
  configureCurrentSet,
  createPlayingMatch,
  ids,
  winSetToLove,
} from '@/domain/matches/test/fixtures';
import type { Player } from '@/domain/players/types';

const groupId = 'group-1' as GroupId;
const now = '2026-11-13T12:00:00.000Z' as ISODateTime;
const playerIds = [ids.a1, ids.a2, ids.b1, ids.b2];

function player(id: PlayerId, name: string): Player {
  return {
    id,
    name,
    normalizedName: name.toLowerCase(),
    sportGender: 'unspecified',
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
  };
}

const players = [
  player(ids.a1, 'Ana'),
  player(ids.a2, 'Álex'),
  player(ids.b1, 'Bea'),
  player(ids.b2, 'Bruno'),
];
const members: GroupMember[] = playerIds.map((playerId, index) => ({
  id: `member-${index}` as GroupMemberId,
  groupId,
  playerId,
  kind: index === 0 ? 'account' : 'guest',
  role: index === 0 ? 'owner' : 'member',
  accountUserId: null,
  joinedAt: now,
  leftAt: null,
}));

function finishedMatch() {
  const firstSet = winSetToLove(createPlayingMatch(), 'A');
  return winSetToLove(configureCurrentSet(firstSet), 'A');
}

describe('buildGroupRanking', () => {
  it('calcula puntos y Elo para partidos de dobles', () => {
    const ranking = buildGroupRanking({
      members,
      players,
      matches: [{ state: finishedMatch(), finishedAt: now }],
      adjustments: [],
      scoring: DEFAULT_GROUP_SCORING,
    });

    expect(ranking.find((row) => row.name === 'Ana')).toMatchObject({
      rankingPoints: 3,
      elo: 1016,
    });
    expect(ranking.find((row) => row.name === 'Álex')).toMatchObject({
      rankingPoints: 3,
      elo: 1016,
    });
    expect(ranking.find((row) => row.name === 'Bea')).toMatchObject({ rankingPoints: 1, elo: 984 });
    expect(ranking.find((row) => row.name === 'Bruno')).toMatchObject({
      rankingPoints: 1,
      elo: 984,
    });
    expect(ranking.every((row) => row.played === 1)).toBe(true);
  });

  it('aplica ajustes manuales sin alterar el historial del partido', () => {
    const adjustment: RatingAdjustment = {
      id: 'adjustment-1' as RatingAdjustmentId,
      groupId,
      memberId: members[2]!.id,
      pointsDelta: 5,
      eloDelta: 20,
      reason: 'Bonificación de temporada',
      createdByUserId: null,
      createdAt: now,
    };
    const ranking = buildGroupRanking({
      members,
      players,
      matches: [{ state: finishedMatch(), finishedAt: now }],
      adjustments: [adjustment],
      scoring: DEFAULT_GROUP_SCORING,
    });

    expect(ranking[0]).toMatchObject({ name: 'Bea', rankingPoints: 6, elo: 1004, lost: 1 });
  });

  it('no cuenta partidos con jugadores ajenos al grupo', () => {
    const ranking = buildGroupRanking({
      members: members.slice(0, 3),
      players,
      matches: [{ state: finishedMatch(), finishedAt: now }],
      adjustments: [],
      scoring: DEFAULT_GROUP_SCORING,
    });

    expect(ranking.every((row) => row.played === 0 && row.rankingPoints === 0)).toBe(true);
  });
});
