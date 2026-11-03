import { z } from 'zod';
import type { PlayerId } from '@/domain/common/types';
import { normalizePlayerName, type Player, type SportGender } from '@/domain/players/types';
import { ApplicationError } from '@/application/errors';
import type { PlayerRepository } from '@/application/ports/repositories';
import type { Clock, IdGenerator } from '@/application/ports/system';

const playerInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
  sportGender: z.enum(['male', 'female', 'unspecified']).default('unspecified'),
});

export interface SavePlayerInput {
  name: string;
  sportGender?: SportGender;
}

export class PlayerService {
  constructor(
    private readonly repository: PlayerRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async create(input: SavePlayerInput): Promise<Player> {
    const parsed = this.parse(input);
    const now = this.clock.now();
    const player: Player = {
      id: this.ids.next() as PlayerId,
      name: parsed.name.replace(/\s+/g, ' '),
      normalizedName: normalizePlayerName(parsed.name),
      sportGender: parsed.sportGender,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    };
    await this.repository.put(player);
    return player;
  }

  async update(id: PlayerId, input: SavePlayerInput): Promise<Player> {
    const current = await this.requirePlayer(id);
    const parsed = this.parse(input);
    const player: Player = {
      ...current,
      name: parsed.name.replace(/\s+/g, ' '),
      normalizedName: normalizePlayerName(parsed.name),
      sportGender: parsed.sportGender,
      updatedAt: this.clock.now(),
    };
    await this.repository.put(player);
    return player;
  }

  async archive(id: PlayerId): Promise<Player> {
    const current = await this.requirePlayer(id);
    const now = this.clock.now();
    const player = { ...current, archivedAt: now, updatedAt: now };
    await this.repository.put(player);
    return player;
  }

  async restore(id: PlayerId): Promise<Player> {
    const current = await this.requirePlayer(id);
    const player = { ...current, archivedAt: null, updatedAt: this.clock.now() };
    await this.repository.put(player);
    return player;
  }

  list(includeArchived = false) {
    return this.repository.list(includeArchived);
  }

  search(query: string, includeArchived = false) {
    return this.repository.search(normalizePlayerName(query), includeArchived);
  }

  private parse(input: SavePlayerInput) {
    const result = playerInputSchema.safeParse(input);
    if (!result.success) {
      throw new ApplicationError(
        'VALIDATION_ERROR',
        'El nombre debe contener entre 1 y 60 caracteres.',
      );
    }
    return result.data;
  }

  private async requirePlayer(id: PlayerId): Promise<Player> {
    const player = await this.repository.get(id);
    if (!player) throw new ApplicationError('NOT_FOUND', 'No se ha encontrado el jugador.');
    return player;
  }
}
