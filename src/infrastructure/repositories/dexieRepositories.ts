import type { MatchId, PlayerId, TeamId } from '@/domain/common/types';
import type { StoredMatchEvent } from '@/domain/matches/events';
import type { MatchStatus } from '@/domain/matches/types';
import type { Player } from '@/domain/players/types';
import type { Team } from '@/domain/teams/types';
import type {
  MatchEventRepository,
  MatchRepository,
  PlayerRepository,
  SnapshotRepository,
  TeamRepository,
} from '@/application/ports/repositories';
import type { MatchRecord, MatchSnapshotRecord } from '@/application/ports/records';
import type { PadelDatabase } from '@/infrastructure/database/dexie/database';

export class DexiePlayerRepository implements PlayerRepository {
  constructor(private readonly db: PadelDatabase) {}

  get(id: PlayerId): Promise<Player | undefined> {
    return this.db.players.get(id);
  }

  async list(includeArchived = false): Promise<readonly Player[]> {
    const players = await this.db.players.orderBy('normalizedName').toArray();
    return includeArchived ? players : players.filter((player) => player.archivedAt === null);
  }

  async search(normalizedQuery: string, includeArchived = false): Promise<readonly Player[]> {
    const players = await this.list(includeArchived);
    return players.filter((player) => player.normalizedName.includes(normalizedQuery));
  }

  async put(player: Player): Promise<void> {
    await this.db.players.put(player);
  }
}

export class DexieTeamRepository implements TeamRepository {
  constructor(private readonly db: PadelDatabase) {}

  get(id: TeamId): Promise<Team | undefined> {
    return this.db.teams.get(id);
  }

  findByCanonicalKey(canonicalKey: string): Promise<Team | undefined> {
    return this.db.teams.where('canonicalKey').equals(canonicalKey).first();
  }

  async list(includeArchived = false): Promise<readonly Team[]> {
    const teams = await this.db.teams.orderBy('createdAt').reverse().toArray();
    return includeArchived ? teams : teams.filter((team) => team.archivedAt === null);
  }

  async put(team: Team): Promise<void> {
    await this.db.teams.put(team);
  }
}

export class DexieMatchRepository implements MatchRepository {
  constructor(private readonly db: PadelDatabase) {}

  get(id: MatchId): Promise<MatchRecord | undefined> {
    return this.db.matches.get(id);
  }

  async listByStatuses(statuses: readonly MatchStatus[]): Promise<readonly MatchRecord[]> {
    if (statuses.length === 0) return [];
    const matches = await this.db.matches
      .where('status')
      .anyOf([...statuses])
      .toArray();
    return matches.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async put(match: MatchRecord): Promise<void> {
    await this.db.matches.put(match);
  }
}

export class DexieMatchEventRepository implements MatchEventRepository {
  constructor(private readonly db: PadelDatabase) {}

  async listByMatch(matchId: MatchId): Promise<readonly StoredMatchEvent[]> {
    const events = await this.db.matchEvents.where('matchId').equals(matchId).toArray();
    return events.sort((a, b) => a.sequence - b.sequence);
  }

  async appendMany(events: readonly StoredMatchEvent[]): Promise<void> {
    if (events.length === 0) return;
    await this.db.matchEvents.bulkAdd([...events]);
  }
}

export class DexieSnapshotRepository implements SnapshotRepository {
  constructor(private readonly db: PadelDatabase) {}

  get(matchId: MatchId): Promise<MatchSnapshotRecord | undefined> {
    return this.db.matchSnapshots.get(matchId);
  }

  async put(snapshot: MatchSnapshotRecord): Promise<void> {
    await this.db.matchSnapshots.put(snapshot);
  }

  async delete(matchId: MatchId): Promise<void> {
    await this.db.matchSnapshots.delete(matchId);
  }
}
