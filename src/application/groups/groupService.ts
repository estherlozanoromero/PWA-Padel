import { z } from 'zod';
import type { GroupId, GroupMemberId, PlayerId, RatingAdjustmentId } from '@/domain/common/types';
import { buildGroupRanking, type GroupRankingRow } from '@/domain/groups/ranking';
import {
  DEFAULT_GROUP_SCORING,
  normalizeGroupName,
  type GroupMember,
  type GroupScoringRules,
  type PlayerGroup,
  type RatingAdjustment,
} from '@/domain/groups/types';
import { replay } from '@/domain/matches/events';
import type { SportGender } from '@/domain/players/types';
import { ApplicationError } from '@/application/errors';
import type { PlayerService } from '@/application/players/playerService';
import type { Clock, IdGenerator } from '@/application/ports/system';
import type { PadelDatabase } from '@/infrastructure/database/dexie/database';

const groupNameSchema = z.string().trim().min(2).max(60);
const adjustmentSchema = z.object({
  pointsDelta: z.number().int().min(-999).max(999),
  eloDelta: z.number().int().min(-999).max(999),
  reason: z.string().trim().min(3).max(160),
});
const scoringSchema = z.object({
  winPoints: z.number().int().min(0).max(99),
  lossPoints: z.number().int().min(0).max(99),
  initialElo: z.number().int().min(100).max(5000),
  eloKFactor: z.number().int().min(1).max(128),
});

export interface GroupMemberDetails {
  membership: GroupMember;
  name: string;
  archived: boolean;
}

export interface GroupDashboard {
  group: PlayerGroup;
  members: readonly GroupMemberDetails[];
  ranking: readonly GroupRankingRow[];
  adjustments: readonly RatingAdjustment[];
  countedMatches: number;
}

export class GroupService {
  constructor(
    private readonly db: PadelDatabase,
    private readonly players: PlayerService,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async create(name: string): Promise<PlayerGroup> {
    const parsed = groupNameSchema.safeParse(name);
    if (!parsed.success) {
      throw new ApplicationError(
        'VALIDATION_ERROR',
        'El nombre debe tener entre 2 y 60 caracteres.',
      );
    }
    const now = this.clock.now();
    const group: PlayerGroup = {
      id: this.ids.next() as GroupId,
      name: parsed.data.replace(/\s+/g, ' '),
      normalizedName: normalizeGroupName(parsed.data),
      scoring: { ...DEFAULT_GROUP_SCORING },
      ownerUserId: null,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    };
    await this.db.groups.add(group);
    return group;
  }

  async list(includeArchived = false): Promise<readonly PlayerGroup[]> {
    const groups = await this.db.groups.orderBy('createdAt').reverse().toArray();
    return includeArchived ? groups : groups.filter((group) => group.archivedAt === null);
  }

  async addMember(groupId: GroupId, playerId: PlayerId): Promise<GroupMember> {
    await this.requireGroup(groupId);
    const player = await this.players
      .list(true)
      .then((items) => items.find((item) => item.id === playerId));
    if (!player) throw new ApplicationError('NOT_FOUND', 'No se ha encontrado el jugador.');
    const existing = await this.db.groupMembers
      .where('[groupId+playerId]')
      .equals([groupId, playerId])
      .first();
    if (existing) {
      const restored = {
        ...existing,
        leftAt: null,
        kind: existing.accountUserId ? 'account' : 'guest',
      } as GroupMember;
      await this.db.groupMembers.put(restored);
      return restored;
    }
    const member: GroupMember = {
      id: this.ids.next() as GroupMemberId,
      groupId,
      playerId,
      kind: 'guest',
      role: 'member',
      accountUserId: null,
      joinedAt: this.clock.now(),
      leftAt: null,
    };
    await this.db.groupMembers.add(member);
    return member;
  }

  async createGuest(
    groupId: GroupId,
    input: { name: string; sportGender?: SportGender },
  ): Promise<GroupMember> {
    await this.requireGroup(groupId);
    const player = await this.players.create(input);
    return this.addMember(groupId, player.id);
  }

  async removeMember(memberId: GroupMemberId): Promise<void> {
    const member = await this.db.groupMembers.get(memberId);
    if (!member) throw new ApplicationError('NOT_FOUND', 'No se ha encontrado el miembro.');
    await this.db.groupMembers.put({ ...member, leftAt: this.clock.now() });
  }

  async updateScoring(groupId: GroupId, input: GroupScoringRules): Promise<PlayerGroup> {
    const parsed = scoringSchema.safeParse(input);
    if (!parsed.success)
      throw new ApplicationError('VALIDATION_ERROR', 'La configuración no es válida.');
    const current = await this.requireGroup(groupId);
    const group = { ...current, scoring: parsed.data, updatedAt: this.clock.now() };
    await this.db.groups.put(group);
    return group;
  }

  async addAdjustment(
    groupId: GroupId,
    memberId: GroupMemberId,
    input: { pointsDelta: number; eloDelta: number; reason: string },
  ): Promise<RatingAdjustment> {
    await this.requireGroup(groupId);
    const member = await this.db.groupMembers.get(memberId);
    if (!member || member.groupId !== groupId) {
      throw new ApplicationError('NOT_FOUND', 'El miembro no pertenece al grupo.');
    }
    const parsed = adjustmentSchema.safeParse(input);
    if (!parsed.success) {
      throw new ApplicationError('VALIDATION_ERROR', 'Indica un motivo y valores válidos.');
    }
    const adjustment: RatingAdjustment = {
      id: this.ids.next() as RatingAdjustmentId,
      groupId,
      memberId,
      ...parsed.data,
      createdByUserId: null,
      createdAt: this.clock.now(),
    };
    await this.db.ratingAdjustments.add(adjustment);
    return adjustment;
  }

  async dashboard(groupId: GroupId): Promise<GroupDashboard> {
    const group = await this.requireGroup(groupId);
    const [members, players, adjustments, matches] = await Promise.all([
      this.db.groupMembers.where('groupId').equals(groupId).toArray(),
      this.db.players.toArray(),
      this.db.ratingAdjustments.where('groupId').equals(groupId).sortBy('createdAt'),
      this.db.matches.where('status').equals('finished').toArray(),
    ]);
    const playerIds = new Set(members.map((member) => member.playerId));
    const rankingMatches = await Promise.all(
      matches.map(async (match) => ({
        state: replay(
          match.initialState,
          await this.db.matchEvents.where('matchId').equals(match.id).toArray(),
        ),
        finishedAt: match.finishedAt ?? match.updatedAt,
      })),
    );
    const countedMatches = rankingMatches.filter((match) =>
      [...match.state.teams.A.players, ...match.state.teams.B.players].every((player) =>
        playerIds.has(player.id),
      ),
    );
    const playerById = new Map(players.map((player) => [player.id, player]));
    return {
      group,
      members: members
        .map((membership) => ({
          membership,
          name: playerById.get(membership.playerId)?.name ?? 'Jugador desconocido',
          archived: playerById.get(membership.playerId)?.archivedAt !== null,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      ranking: buildGroupRanking({
        members,
        players,
        matches: countedMatches,
        adjustments,
        scoring: group.scoring,
      }),
      adjustments,
      countedMatches: countedMatches.length,
    };
  }

  private async requireGroup(groupId: GroupId): Promise<PlayerGroup> {
    const group = await this.db.groups.get(groupId);
    if (!group) throw new ApplicationError('NOT_FOUND', 'No se ha encontrado el grupo.');
    return group;
  }
}
