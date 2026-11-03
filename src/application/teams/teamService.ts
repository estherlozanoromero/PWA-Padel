import { z } from 'zod';
import type { PlayerId, TeamId } from '@/domain/common/types';
import { canonicalTeamKey, type Team } from '@/domain/teams/types';
import { ApplicationError } from '@/application/errors';
import type { PlayerRepository, TeamRepository } from '@/application/ports/repositories';
import type { Clock, IdGenerator } from '@/application/ports/system';

const displayNameSchema = z.string().trim().max(60).nullable();

export interface CreateTeamInput {
  playerIds: readonly [PlayerId, PlayerId];
  displayName?: string | null;
}

export interface CreateTeamResult {
  team: Team;
  reused: boolean;
}

export class TeamService {
  constructor(
    private readonly teams: TeamRepository,
    private readonly players: PlayerRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async create(input: CreateTeamInput): Promise<CreateTeamResult> {
    if (input.playerIds[0] === input.playerIds[1]) {
      throw new ApplicationError(
        'VALIDATION_ERROR',
        'Una pareja necesita dos jugadores distintos.',
      );
    }
    const [first, second] = await Promise.all(input.playerIds.map((id) => this.players.get(id)));
    if (!first || !second) {
      throw new ApplicationError('NOT_FOUND', 'No se ha encontrado uno de los jugadores.');
    }
    if (first.archivedAt || second.archivedAt) {
      throw new ApplicationError('PLAYER_ARCHIVED', 'No se puede usar un jugador archivado.');
    }

    const canonicalKey = canonicalTeamKey(input.playerIds);
    const existing = await this.teams.findByCanonicalKey(canonicalKey);
    const now = this.clock.now();
    const displayName = this.parseDisplayName(input.displayName ?? null);
    if (existing) {
      const restored = {
        ...existing,
        displayName: displayName ?? existing.displayName,
        archivedAt: null,
        updatedAt: now,
      };
      await this.teams.put(restored);
      return { team: restored, reused: true };
    }

    const team: Team = {
      id: this.ids.next() as TeamId,
      playerIds: input.playerIds,
      canonicalKey,
      displayName,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    };
    await this.teams.put(team);
    return { team, reused: false };
  }

  async archive(id: TeamId): Promise<Team> {
    const team = await this.teams.get(id);
    if (!team) throw new ApplicationError('NOT_FOUND', 'No se ha encontrado la pareja.');
    const now = this.clock.now();
    const archived = { ...team, archivedAt: now, updatedAt: now };
    await this.teams.put(archived);
    return archived;
  }

  list(includeArchived = false) {
    return this.teams.list(includeArchived);
  }

  private parseDisplayName(displayName: string | null): string | null {
    const result = displayNameSchema.safeParse(displayName);
    if (!result.success) {
      throw new ApplicationError(
        'VALIDATION_ERROR',
        'El nombre de pareja no puede superar 60 caracteres.',
      );
    }
    return result.data === '' ? null : result.data;
  }
}
