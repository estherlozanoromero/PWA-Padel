import type { ISODateTime, MatchId, PlayerId } from '@/domain/common/types';
import { createRules } from '@/domain/matches/rules';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { MatchService } from '@/application/matches/matchService';
import { PlayerService } from '@/application/players/playerService';
import type { Clock, IdGenerator } from '@/application/ports/system';
import { TeamService } from '@/application/teams/teamService';
import { PadelDatabase } from '@/infrastructure/database/dexie/database';
import {
  DexieMatchEventRepository,
  DexiePlayerRepository,
  DexieSnapshotRepository,
  DexieTeamRepository,
} from '@/infrastructure/repositories/dexieRepositories';
import { DexieMatchUnitOfWork } from '@/infrastructure/repositories/dexieUnitOfWork';
import { ids, teams } from '@/domain/matches/test/fixtures';

class IncrementingIds implements IdGenerator {
  private value = 0;

  next(): string {
    this.value += 1;
    return `generated-${this.value}`;
  }
}

class IncrementingClock implements Clock {
  private minute = 0;

  now(): ISODateTime {
    const value = `2026-11-03T12:${String(this.minute).padStart(2, '0')}:00.000Z`;
    this.minute += 1;
    return value as ISODateTime;
  }
}

describe('persistencia IndexedDB', () => {
  let db: PadelDatabase;
  let clock: IncrementingClock;
  let generatedIds: IncrementingIds;

  beforeEach(() => {
    db = new PadelDatabase(`padel-test-${crypto.randomUUID()}`);
    clock = new IncrementingClock();
    generatedIds = new IncrementingIds();
  });

  afterEach(async () => {
    db.close();
    await db.delete();
  });

  it('crea, busca, edita, archiva y restaura jugadores', async () => {
    const service = new PlayerService(new DexiePlayerRepository(db), clock, generatedIds);
    const ana = await service.create({ name: '  Ána   García ', sportGender: 'female' });
    const bruno = await service.create({ name: 'Bruno' });

    expect(ana.name).toBe('Ána García');
    expect(ana.normalizedName).toBe('ana garcia');
    expect(await service.search('garcía')).toEqual([ana]);
    expect((await service.list()).map((player) => player.id)).toEqual([ana.id, bruno.id]);

    const edited = await service.update(bruno.id, { name: 'Bruno Soler', sportGender: 'male' });
    expect(edited.normalizedName).toBe('bruno soler');
    await service.archive(ana.id);
    expect(await service.list()).toEqual([edited]);
    expect(await service.list(true)).toHaveLength(2);
    await service.restore(ana.id);
    expect(await service.list()).toHaveLength(2);
  });

  it('valida jugadores inexistentes y nombres incorrectos', async () => {
    const service = new PlayerService(new DexiePlayerRepository(db), clock, generatedIds);
    await expect(service.create({ name: '  ' })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    await expect(service.archive('missing' as PlayerId)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('reutiliza parejas sin depender del orden de jugadores', async () => {
    const players = new PlayerService(new DexiePlayerRepository(db), clock, generatedIds);
    const teamsRepository = new DexieTeamRepository(db);
    const service = new TeamService(
      teamsRepository,
      new DexiePlayerRepository(db),
      clock,
      generatedIds,
    );
    const first = await players.create({ name: 'Ana' });
    const second = await players.create({ name: 'Marta' });

    const created = await service.create({ playerIds: [first.id, second.id] });
    const reused = await service.create({
      playerIds: [second.id, first.id],
      displayName: 'Las Verdes',
    });

    expect(created.reused).toBe(false);
    expect(reused.reused).toBe(true);
    expect(reused.team.id).toBe(created.team.id);
    expect(reused.team.displayName).toBe('Las Verdes');
    expect(await service.list()).toHaveLength(1);
  });

  it('impide parejas repetidas consigo mismas o con jugadores archivados', async () => {
    const playerRepository = new DexiePlayerRepository(db);
    const players = new PlayerService(playerRepository, clock, generatedIds);
    const service = new TeamService(
      new DexieTeamRepository(db),
      playerRepository,
      clock,
      generatedIds,
    );
    const first = await players.create({ name: 'Ana' });
    const second = await players.create({ name: 'Marta' });
    await expect(service.create({ playerIds: [first.id, first.id] })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    await players.archive(second.id);
    await expect(service.create({ playerIds: [first.id, second.id] })).rejects.toMatchObject({
      code: 'PLAYER_ARCHIVED',
    });
  });

  function createMatchService() {
    return new MatchService(new DexieMatchUnitOfWork(db), clock, generatedIds);
  }

  it('guarda comando, evento, snapshot y partido de forma coordinada', async () => {
    const service = createMatchService();
    const created = await service.create({ teams, rules: createRules('classic_best_of_3') });
    const matchId = created.record.id;
    await service.execute(matchId, { type: 'START_MATCH', firstServingSide: 'A' });
    await service.execute(matchId, {
      type: 'CONFIGURE_SET_SERVICE',
      firstServerId: ids.a1,
      otherTeamFirstServerId: ids.b1,
    });
    for (let point = 0; point < 4; point += 1) {
      await service.execute(matchId, { type: 'AWARD_POINT', winner: 'A' });
    }

    const events = await new DexieMatchEventRepository(db).listByMatch(matchId);
    const snapshot = await new DexieSnapshotRepository(db).get(matchId);
    const record = await db.matches.get(matchId);
    expect(events).toHaveLength(6);
    expect(events.map((event) => event.sequence)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(snapshot?.state.sets[0]?.games).toEqual([1, 0]);
    expect(snapshot?.lastSequence).toBe(6);
    expect(record?.status).toBe('playing');
    expect(record?.startedAt).not.toBeNull();
  });

  it('deshace el último punto mediante un evento de reversión', async () => {
    const service = createMatchService();
    const { record } = await service.create({
      teams,
      rules: createRules('classic_best_of_3'),
    });
    await service.execute(record.id, { type: 'START_MATCH', firstServingSide: 'A' });
    await service.execute(record.id, {
      type: 'CONFIGURE_SET_SERVICE',
      firstServerId: ids.a1,
      otherTeamFirstServerId: ids.b1,
    });
    for (let point = 0; point < 4; point += 1) {
      await service.execute(record.id, { type: 'AWARD_POINT', winner: 'A' });
    }
    const restored = await service.undo(record.id);

    expect(restored.state.sets[0]?.games).toEqual([0, 0]);
    expect(restored.state.currentPoints.raw).toEqual([3, 0]);
    const events = await new DexieMatchEventRepository(db).listByMatch(record.id);
    expect(events.at(-1)?.event.type).toBe('EVENT_REVERTED');
    expect(events).toHaveLength(7);
  });

  it('reconstruye y repara snapshots ausentes, atrasados o corruptos', async () => {
    const service = createMatchService();
    const { record } = await service.create({
      teams,
      rules: createRules('classic_best_of_3'),
    });
    await service.execute(record.id, { type: 'START_MATCH', firstServingSide: 'A' });
    await service.execute(record.id, {
      type: 'CONFIGURE_SET_SERVICE',
      firstServerId: ids.a1,
      otherTeamFirstServerId: ids.b1,
    });
    await service.execute(record.id, { type: 'AWARD_POINT', winner: 'B' });

    await db.matchSnapshots.delete(record.id);
    const missing = await service.recover(record.id);
    expect(missing.state.currentPoints.raw).toEqual([0, 1]);
    expect(await db.matchSnapshots.get(record.id)).toBeDefined();

    await db.matchSnapshots.put({
      matchId: record.id,
      state: record.initialState,
      lastSequence: 3,
      updatedAt: clock.now(),
    });
    const corrupt = await service.recover(record.id);
    expect(corrupt.state.status).toBe('playing');
    expect(corrupt.state.currentPoints.raw).toEqual([0, 1]);
  });

  it('no confía en un snapshot corrupto al ejecutar el siguiente comando', async () => {
    const service = createMatchService();
    const { record } = await service.create({
      teams,
      rules: createRules('classic_best_of_3'),
    });
    await service.execute(record.id, { type: 'START_MATCH', firstServingSide: 'A' });
    await service.execute(record.id, {
      type: 'CONFIGURE_SET_SERVICE',
      firstServerId: ids.a1,
      otherTeamFirstServerId: ids.b1,
    });
    await service.execute(record.id, { type: 'AWARD_POINT', winner: 'A' });
    const snapshot = (await db.matchSnapshots.get(record.id))!;
    await db.matchSnapshots.put({
      ...snapshot,
      state: { ...snapshot.state, currentPoints: { raw: [99, 99], deuceStage: 'deuce' } },
    });

    const result = await service.execute(record.id, { type: 'AWARD_POINT', winner: 'B' });
    expect(result.state.currentPoints.raw).toEqual([1, 1]);
  });

  it('revierte por completo una transacción que falla', async () => {
    const service = createMatchService();
    const created = await service.create({ teams, rules: createRules('classic_best_of_3') });
    const rollbackId = 'rollback-match' as MatchId;
    const unitOfWork = new DexieMatchUnitOfWork(db);

    await expect(
      unitOfWork.run(async (repositories) => {
        await repositories.matches.put({
          ...created.record,
          id: rollbackId,
          initialState: { ...created.state, matchId: rollbackId },
        });
        throw new Error('fallo simulado');
      }),
    ).rejects.toThrow('fallo simulado');
    expect(await db.matches.get(rollbackId)).toBeUndefined();
  });

  it('protege la secuencia única por partido', async () => {
    const service = createMatchService();
    const { record } = await service.create({ teams, rules: createRules('classic_best_of_3') });
    await service.execute(record.id, { type: 'START_MATCH', firstServingSide: 'A' });
    const existing = (await db.matchEvents.where('matchId').equals(record.id).first())!;

    await expect(
      db.matchEvents.add({ ...existing, id: 'duplicate-event' as typeof existing.id }),
    ).rejects.toBeDefined();
  });

  it('lista únicamente partidos recuperables', async () => {
    const service = createMatchService();
    const draft = await service.create({ teams, rules: createRules('classic_best_of_3') });
    expect(await service.listRecoverable()).toEqual([]);
    await service.execute(draft.record.id, { type: 'START_MATCH', firstServingSide: 'A' });
    expect((await service.listRecoverable()).map((match) => match.id)).toEqual([draft.record.id]);
  });
});
