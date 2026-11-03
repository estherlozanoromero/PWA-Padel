import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ISODateTime } from '@/domain/common/types';
import { createRules } from '@/domain/matches/rules';
import { ids, teams } from '@/domain/matches/test/fixtures';
import { BackupService } from '@/application/backup/backupService';
import { MatchService } from '@/application/matches/matchService';
import type { Clock, IdGenerator } from '@/application/ports/system';
import { PadelDatabase } from '@/infrastructure/database/dexie/database';
import { DexieMatchUnitOfWork } from '@/infrastructure/repositories/dexieUnitOfWork';

const now = '2026-11-03T12:00:00.000Z' as ISODateTime;
const clock: Clock = { now: () => now };
class Ids implements IdGenerator {
  private count = 0;
  next() {
    this.count += 1;
    return `backup-${this.count}`;
  }
}

describe('backup local', () => {
  let db: PadelDatabase;
  beforeEach(() => {
    db = new PadelDatabase(`backup-test-${crypto.randomUUID()}`);
  });
  afterEach(async () => {
    db.close();
    await db.delete();
  });

  it('exporta, reemplaza y regenera snapshots en un round-trip', async () => {
    const players = Object.values(teams)
      .flatMap((team) => team.players)
      .map((player) => ({
        ...player,
        normalizedName: player.name.toLowerCase(),
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
      }));
    await db.players.bulkAdd(players);
    await db.teams.bulkAdd(
      Object.values(teams).map((team) => ({
        id: team.sourceTeamId,
        playerIds: team.players.map((player) => player.id) as [typeof ids.a1, typeof ids.a2],
        canonicalKey: team.players
          .map((player) => player.id)
          .sort()
          .join('::'),
        displayName: team.displayName,
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
      })),
    );
    const matches = new MatchService(new DexieMatchUnitOfWork(db), clock, new Ids());
    const created = await matches.create({ teams, rules: createRules('classic_best_of_3') });
    await matches.execute(created.record.id, { type: 'START_MATCH', firstServingSide: 'A' });
    await matches.execute(created.record.id, {
      type: 'CONFIGURE_SET_SERVICE',
      firstServerId: ids.a1,
      otherTeamFirstServerId: ids.b1,
    });
    await matches.execute(created.record.id, { type: 'AWARD_POINT', winner: 'A' });
    const service = new BackupService(db, clock);
    const backup = await service.export();

    await db.transaction(
      'rw',
      [db.players, db.teams, db.matches, db.matchEvents, db.matchSnapshots],
      async () => {
        await Promise.all([
          db.players.clear(),
          db.teams.clear(),
          db.matches.clear(),
          db.matchEvents.clear(),
          db.matchSnapshots.clear(),
        ]);
      },
    );
    await service.replaceAll(backup);

    expect(await db.players.count()).toBe(4);
    expect(await db.matches.count()).toBe(1);
    expect((await db.matchSnapshots.get(created.record.id))?.state.currentPoints.raw).toEqual([
      1, 0,
    ]);
    expect((await service.export()).data).toEqual(backup.data);
  });

  it('rechaza un archivo alterado y referencias rotas antes de escribir', async () => {
    const service = new BackupService(db, clock);
    const backup = await service.export();
    await expect(
      service.preview(
        JSON.stringify({ ...backup, appVersion: 'altered', checksum: '0'.repeat(64) }),
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(await db.players.count()).toBe(0);
  });
});
