import type { Session, User } from '@supabase/supabase-js';
import type {
  GroupId,
  GroupMemberId,
  ISODateTime,
  PlayerId,
  RatingAdjustmentId,
  UserId,
} from '@/domain/common/types';
import { normalizeGroupName, type GroupMember, type PlayerGroup } from '@/domain/groups/types';
import { replay } from '@/domain/matches/events';
import type { StoredMatchEvent } from '@/domain/matches/events';
import type { Player } from '@/domain/players/types';
import type { MatchRecord } from '@/application/ports/records';
import { ApplicationError } from '@/application/errors';
import type { PadelDatabase } from '@/infrastructure/database/dexie/database';
import { database } from '@/infrastructure/database/dexie/database';
import { supabase } from '@/infrastructure/cloud/supabaseClient';

interface CloudGroupRow {
  id: string;
  name: string;
  scoring: PlayerGroup['scoring'];
  owner_user_id: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

interface CloudPlayerRow {
  id: string;
  display_name: string;
  sport_gender: Player['sportGender'];
  managed_by: string | null;
  claimed_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

interface CloudMemberRow {
  id: string;
  group_id: string;
  player_id: string;
  user_id: string | null;
  kind: GroupMember['kind'];
  role: GroupMember['role'];
  joined_at: string;
  updated_at: string;
  left_at: string | null;
}

interface CloudAdjustmentRow {
  id: string;
  group_id: string;
  member_id: string;
  points_delta: number;
  elo_delta: number;
  reason: string;
  created_by: string;
  created_at: string;
}

interface CloudMatchRow {
  id: string;
  group_id: string;
  match_record: MatchRecord;
  match_events: StoredMatchEvent[];
  finished_at: string;
  updated_at: string;
  updated_by: string;
}

export interface PendingInvitation {
  id: string;
  groupId: string;
  groupName: string;
  email: string;
  role: 'admin' | 'member';
  expiresAt: string;
}

function asDate(value: string | null | undefined): string {
  return value ?? '';
}

function newer(local: string | null | undefined, remote: string | null | undefined): boolean {
  return asDate(local) > asDate(remote);
}

function requireClient() {
  if (!supabase) {
    throw new ApplicationError('STORAGE_ERROR', 'La sincronización todavía no está configurada.');
  }
  return supabase;
}

function fail(error: { message: string } | null, context: string): void {
  if (error) throw new ApplicationError('STORAGE_ERROR', `${context}: ${error.message}`);
}

export class CloudSyncService {
  constructor(private readonly db: PadelDatabase) {}

  async syncAll(): Promise<ISODateTime> {
    const client = requireClient();
    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    fail(sessionError, 'No se ha podido comprobar la sesión');
    const session = sessionData.session;
    if (!session) throw new ApplicationError('VALIDATION_ERROR', 'Inicia sesión para sincronizar.');

    await this.mergeGroups(session);
    const syncedAt = new Date().toISOString() as ISODateTime;
    await this.db.settings.put({ key: 'cloud.lastSyncAt', value: syncedAt, updatedAt: syncedAt });
    return syncedAt;
  }

  async lastSyncAt(): Promise<ISODateTime | null> {
    const value = await this.db.settings.get('cloud.lastSyncAt');
    return typeof value?.value === 'string' ? (value.value as ISODateTime) : null;
  }

  async invite(groupId: GroupId, email: string, role: 'admin' | 'member'): Promise<void> {
    const client = requireClient();
    const user = await this.requireUser();
    const { error } = await client.from('group_invitations').insert({
      group_id: groupId,
      email: email.trim().toLocaleLowerCase('es'),
      role,
      invited_by: user.id,
    });
    fail(error, 'No se ha podido crear la invitación');
  }

  async pendingInvitations(): Promise<readonly PendingInvitation[]> {
    const client = requireClient();
    const user = await this.requireUser();
    if (!user.email) return [];
    const { data, error } = await client
      .from('group_invitations')
      .select('id, group_id, email, role, expires_at, groups(name)')
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString());
    fail(error, 'No se han podido cargar las invitaciones');
    return (data ?? []).map((row) => {
      const related = row.groups as unknown as { name?: string } | null;
      return {
        id: String(row.id),
        groupId: String(row.group_id),
        groupName: related?.name ?? 'Grupo compartido',
        email: String(row.email),
        role: row.role as 'admin' | 'member',
        expiresAt: String(row.expires_at),
      };
    });
  }

  async acceptInvitation(id: string): Promise<void> {
    const client = requireClient();
    const user = await this.requireUser();
    const { error } = await client
      .from('group_invitations')
      .update({ accepted_at: new Date().toISOString(), accepted_by: user.id })
      .eq('id', id);
    fail(error, 'No se ha podido aceptar la invitación');
    await this.syncAll();
  }

  private async requireUser(): Promise<User> {
    const client = requireClient();
    const { data, error } = await client.auth.getUser();
    fail(error, 'No se ha podido comprobar el usuario');
    if (!data.user) throw new ApplicationError('VALIDATION_ERROR', 'Inicia sesión para continuar.');
    return data.user;
  }

  private async mergeGroups(session: Session): Promise<void> {
    const client = requireClient();
    const { data: remoteData, error: groupsError } = await client.from('groups').select('*');
    fail(groupsError, 'No se han podido descargar los grupos');
    const remoteGroups = (remoteData ?? []) as CloudGroupRow[];
    const remoteById = new Map(remoteGroups.map((group) => [group.id, group]));
    const localGroups = await this.db.groups.toArray();

    for (const local of localGroups) {
      const remote = remoteById.get(local.id);
      const ownsLocal = local.ownerUserId === null || local.ownerUserId === session.user.id;
      if ((!remote || newer(local.updatedAt, remote.updated_at)) && ownsLocal) {
        const row = {
          id: local.id,
          name: local.name,
          scoring: local.scoring,
          owner_user_id: local.ownerUserId ?? session.user.id,
          created_at: local.createdAt,
          updated_at: local.updatedAt,
          archived_at: local.archivedAt,
        };
        const { error } = await client.from('groups').upsert(row, { onConflict: 'id' });
        fail(error, `No se ha podido subir el grupo ${local.name}`);
        remoteById.set(local.id, row);
      }
    }

    const groupIds = [...remoteById.keys()];
    if (groupIds.length === 0) return;
    const [membersResult, adjustmentsResult, matchesResult] = await Promise.all([
      client.from('group_members').select('*').in('group_id', groupIds),
      client.from('rating_adjustments').select('*').in('group_id', groupIds),
      client.from('group_matches').select('*').in('group_id', groupIds),
    ]);
    fail(membersResult.error, 'No se han podido descargar los miembros');
    fail(adjustmentsResult.error, 'No se han podido descargar los ajustes');
    fail(matchesResult.error, 'No se han podido descargar los partidos');
    const remoteMembers = (membersResult.data ?? []) as CloudMemberRow[];
    const playerIds = [...new Set(remoteMembers.map((member) => member.player_id))];
    const playersResult =
      playerIds.length > 0
        ? await client.from('players').select('*').in('id', playerIds)
        : { data: [] as CloudPlayerRow[], error: null };
    fail(playersResult.error, 'No se han podido descargar los jugadores');

    await this.pushOwnedData(
      session,
      remoteById,
      remoteMembers,
      playersResult.data as CloudPlayerRow[],
      matchesResult.data as CloudMatchRow[],
    );
    await this.pullRemoteData(
      remoteById,
      remoteMembers,
      playersResult.data as CloudPlayerRow[],
      adjustmentsResult.data as CloudAdjustmentRow[],
      matchesResult.data as CloudMatchRow[],
    );
  }

  private async pushOwnedData(
    session: Session,
    groups: Map<string, CloudGroupRow>,
    remoteMembers: readonly CloudMemberRow[],
    remotePlayers: readonly CloudPlayerRow[],
    remoteMatches: readonly CloudMatchRow[],
  ): Promise<void> {
    const client = requireClient();
    const localMembers = await this.db.groupMembers.toArray();
    const remoteMemberById = new Map(remoteMembers.map((member) => [member.id, member]));
    const remotePlayerById = new Map(remotePlayers.map((player) => [player.id, player]));
    const remoteMatchById = new Map(
      remoteMatches.map((match) => [`${match.group_id}:${match.id}`, match]),
    );

    for (const [groupId, remoteGroup] of groups) {
      const members = localMembers.filter((member) => member.groupId === groupId);
      const canManage =
        remoteGroup.owner_user_id === session.user.id ||
        members.some(
          (member) =>
            member.accountUserId === session.user.id &&
            member.leftAt === null &&
            (member.role === 'owner' || member.role === 'admin'),
        );
      if (canManage) {
        for (const member of members) {
          if (member.kind === 'guest') {
            const player = await this.db.players.get(member.playerId);
            const remotePlayer = remotePlayerById.get(member.playerId);
            if (player && (!remotePlayer || newer(player.updatedAt, remotePlayer.updated_at))) {
              const { error } = await client.from('players').upsert(
                {
                  id: player.id,
                  display_name: player.name,
                  sport_gender: player.sportGender,
                  managed_by: session.user.id,
                  claimed_by: null,
                  created_at: player.createdAt,
                  updated_at: player.updatedAt,
                  archived_at: player.archivedAt,
                },
                { onConflict: 'id' },
              );
              fail(error, `No se ha podido subir ${player.name}`);
            }
          }
          const remoteMember = remoteMemberById.get(member.id);
          const localUpdated = member.updatedAt ?? member.leftAt ?? member.joinedAt;
          if (!remoteMember || newer(localUpdated, remoteMember.updated_at)) {
            const { error } = await client.from('group_members').upsert(
              {
                id: member.id,
                group_id: member.groupId,
                player_id: member.playerId,
                user_id: member.accountUserId,
                kind: member.kind,
                role: member.role,
                joined_at: member.joinedAt,
                updated_at: localUpdated,
                left_at: member.leftAt,
              },
              { onConflict: 'id' },
            );
            fail(error, 'No se ha podido subir un miembro');
          }
        }
        const adjustments = await this.db.ratingAdjustments
          .where('groupId')
          .equals(groupId as GroupId)
          .toArray();
        for (const adjustment of adjustments) {
          const { error } = await client.from('rating_adjustments').upsert(
            {
              id: adjustment.id,
              group_id: adjustment.groupId,
              member_id: adjustment.memberId,
              points_delta: adjustment.pointsDelta,
              elo_delta: adjustment.eloDelta,
              reason: adjustment.reason,
              created_by: adjustment.createdByUserId ?? session.user.id,
              created_at: adjustment.createdAt,
            },
            { onConflict: 'id', ignoreDuplicates: true },
          );
          fail(error, 'No se ha podido subir un ajuste');
        }
      }

      const memberPlayerIds = new Set(members.map((member) => member.playerId));
      const matches = await this.db.matches.where('status').equals('finished').toArray();
      for (const match of matches) {
        const belongs = [...match.teams.A.players, ...match.teams.B.players].every((player) =>
          memberPlayerIds.has(player.id),
        );
        if (!belongs) continue;
        const remote = remoteMatchById.get(`${groupId}:${match.id}`);
        if (remote && !newer(match.updatedAt, remote.updated_at)) continue;
        const events = await this.db.matchEvents
          .where('matchId')
          .equals(match.id)
          .sortBy('sequence');
        const { error } = await client.from('group_matches').upsert(
          {
            id: match.id,
            group_id: groupId,
            match_record: match,
            match_events: events,
            finished_at: match.finishedAt ?? match.updatedAt,
            updated_at: match.updatedAt,
            updated_by: session.user.id,
          },
          { onConflict: 'group_id,id' },
        );
        fail(error, 'No se ha podido subir un partido');
      }
    }
  }

  private async pullRemoteData(
    groups: Map<string, CloudGroupRow>,
    members: readonly CloudMemberRow[],
    players: readonly CloudPlayerRow[],
    adjustments: readonly CloudAdjustmentRow[],
    matches: readonly CloudMatchRow[],
  ): Promise<void> {
    await this.db.transaction(
      'rw',
      [
        this.db.groups,
        this.db.groupMembers,
        this.db.players,
        this.db.ratingAdjustments,
        this.db.matches,
        this.db.matchEvents,
        this.db.matchSnapshots,
      ],
      async () => {
        for (const remote of groups.values()) {
          const local = await this.db.groups.get(remote.id as GroupId);
          if (!local || !newer(local.updatedAt, remote.updated_at)) {
            await this.db.groups.put({
              id: remote.id as GroupId,
              name: remote.name,
              normalizedName: normalizeGroupName(remote.name),
              scoring: remote.scoring,
              ownerUserId: remote.owner_user_id as UserId,
              createdAt: remote.created_at as ISODateTime,
              updatedAt: remote.updated_at as ISODateTime,
              archivedAt: remote.archived_at as ISODateTime | null,
            });
          }
        }
        for (const remote of players) {
          const local = await this.db.players.get(remote.id as PlayerId);
          if (!local || !newer(local.updatedAt, remote.updated_at)) {
            await this.db.players.put({
              id: remote.id as PlayerId,
              name: remote.display_name,
              normalizedName: remote.display_name.toLocaleLowerCase('es'),
              sportGender: remote.sport_gender,
              createdAt: remote.created_at as ISODateTime,
              updatedAt: remote.updated_at as ISODateTime,
              archivedAt: remote.archived_at as ISODateTime | null,
            });
          }
        }
        for (const remote of members) {
          const local = await this.db.groupMembers.get(remote.id as GroupMemberId);
          const localUpdated = local?.updatedAt ?? local?.leftAt ?? local?.joinedAt;
          if (!local || !newer(localUpdated, remote.updated_at)) {
            await this.db.groupMembers.put({
              id: remote.id as GroupMemberId,
              groupId: remote.group_id as GroupId,
              playerId: remote.player_id as PlayerId,
              kind: remote.kind,
              role: remote.role,
              accountUserId: remote.user_id as UserId | null,
              joinedAt: remote.joined_at as ISODateTime,
              updatedAt: remote.updated_at as ISODateTime,
              leftAt: remote.left_at as ISODateTime | null,
            });
          }
        }
        for (const remote of adjustments) {
          await this.db.ratingAdjustments.put({
            id: remote.id as RatingAdjustmentId,
            groupId: remote.group_id as GroupId,
            memberId: remote.member_id as GroupMemberId,
            pointsDelta: remote.points_delta,
            eloDelta: remote.elo_delta,
            reason: remote.reason,
            createdByUserId: remote.created_by as UserId,
            createdAt: remote.created_at as ISODateTime,
          });
        }
        for (const remote of matches) {
          const record = remote.match_record;
          const local = await this.db.matches.get(record.id);
          if (local && newer(local.updatedAt, remote.updated_at)) continue;
          await this.db.matches.put(record);
          if (remote.match_events.length > 0)
            await this.db.matchEvents.bulkPut(remote.match_events);
          const state = replay(record.initialState, remote.match_events);
          await this.db.matchSnapshots.put({
            matchId: record.id,
            state,
            lastSequence: state.lastAppliedSequence,
            updatedAt: remote.updated_at as ISODateTime,
          });
        }
      },
    );
  }
}

export const cloudSyncService = new CloudSyncService(database);
