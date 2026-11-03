import { z } from 'zod';
import type { ISODateTime } from '@/domain/common/types';
import type { Player } from '@/domain/players/types';
import type { Team } from '@/domain/teams/types';
import type { StoredMatchEvent } from '@/domain/matches/events';
import { replay } from '@/domain/matches/events';
import type { AppSettingRecord, MatchRecord } from '@/application/ports/records';
import { ApplicationError } from '@/application/errors';
import type { Clock } from '@/application/ports/system';
import type { PadelDatabase } from '@/infrastructure/database/dexie/database';

export interface BackupData {
  players: readonly Player[];
  teams: readonly Team[];
  matches: readonly MatchRecord[];
  matchEvents: readonly StoredMatchEvent[];
  settings: readonly AppSettingRecord[];
}

export interface BackupEnvelopeV1 {
  format: 'padel-scorekeeper-backup';
  version: 1;
  exportedAt: ISODateTime;
  appVersion: string;
  data: BackupData;
  checksum: string;
}

export interface BackupPreview {
  envelope: BackupEnvelopeV1;
  summary: { players: number; teams: number; matches: number; events: number; settings: number };
}

const datedEntity = z.object({ id: z.string().min(1), createdAt: z.string() }).passthrough();
const backupSchema = z.object({
  format: z.literal('padel-scorekeeper-backup'),
  version: z.literal(1),
  exportedAt: z.string(),
  appVersion: z.string(),
  data: z.object({
    players: z.array(datedEntity),
    teams: z.array(datedEntity.extend({ playerIds: z.tuple([z.string(), z.string()]) })),
    matches: z.array(
      datedEntity.extend({
        status: z.string(),
        initialState: z.object({ matchId: z.string() }).passthrough(),
      }),
    ),
    matchEvents: z.array(
      z
        .object({
          id: z.string().min(1),
          matchId: z.string().min(1),
          sequence: z.number().int().positive(),
          occurredAt: z.string(),
          schemaVersion: z.literal(1),
          event: z.object({ type: z.string() }).passthrough(),
        })
        .passthrough(),
    ),
    settings: z.array(z.object({ key: z.string().min(1), updatedAt: z.string() }).passthrough()),
  }),
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
});

async function checksum(data: BackupData): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function duplicates(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated];
}

function validateReferences(data: BackupData): void {
  const problems: string[] = [];
  for (const [label, values] of [
    ['jugadores', data.players.map((item) => item.id)],
    ['parejas', data.teams.map((item) => item.id)],
    ['partidos', data.matches.map((item) => item.id)],
    ['eventos', data.matchEvents.map((item) => item.id)],
    ['ajustes', data.settings.map((item) => item.key)],
  ] as const) {
    if (duplicates(values).length > 0) problems.push(`Hay ${label} duplicados.`);
  }

  const playerIds = new Set(data.players.map((item) => item.id));
  const teamIds = new Set(data.teams.map((item) => item.id));
  const matchIds = new Set(data.matches.map((item) => item.id));
  if (data.teams.some((team) => team.playerIds.some((id) => !playerIds.has(id)))) {
    problems.push('Una pareja referencia jugadores inexistentes.');
  }
  if (data.matchEvents.some((event) => !matchIds.has(event.matchId))) {
    problems.push('Un evento referencia un partido inexistente.');
  }
  if (
    data.matches.some(
      (match) =>
        match.initialState.matchId !== match.id ||
        !teamIds.has(match.teams.A.sourceTeamId) ||
        !teamIds.has(match.teams.B.sourceTeamId) ||
        [...match.teams.A.players, ...match.teams.B.players].some(
          (player) => !playerIds.has(player.id),
        ),
    )
  ) {
    problems.push('Un partido contiene referencias históricas incoherentes.');
  }
  const sequences = data.matchEvents.map((event) => `${event.matchId}:${event.sequence}`);
  if (duplicates(sequences).length > 0) problems.push('Hay secuencias de evento duplicadas.');
  if (problems.length > 0) throw new ApplicationError('VALIDATION_ERROR', problems.join(' '));
}

export class BackupService {
  constructor(
    private readonly db: PadelDatabase,
    private readonly clock: Clock,
  ) {}

  async export(): Promise<BackupEnvelopeV1> {
    const data: BackupData = {
      players: (await this.db.players.toArray()).sort((a, b) => a.id.localeCompare(b.id)),
      teams: (await this.db.teams.toArray()).sort((a, b) => a.id.localeCompare(b.id)),
      matches: (await this.db.matches.toArray()).sort((a, b) => a.id.localeCompare(b.id)),
      matchEvents: (await this.db.matchEvents.toArray()).sort(
        (a, b) => a.matchId.localeCompare(b.matchId) || a.sequence - b.sequence,
      ),
      settings: (await this.db.settings.toArray()).sort((a, b) => a.key.localeCompare(b.key)),
    };
    return {
      format: 'padel-scorekeeper-backup',
      version: 1,
      exportedAt: this.clock.now(),
      appVersion: '0.1.0',
      data,
      checksum: await checksum(data),
    };
  }

  async preview(json: string): Promise<BackupPreview> {
    let decoded: unknown;
    try {
      decoded = JSON.parse(json);
    } catch {
      throw new ApplicationError('VALIDATION_ERROR', 'El archivo no contiene JSON válido.');
    }
    const parsed = backupSchema.safeParse(decoded);
    if (!parsed.success) {
      throw new ApplicationError(
        'VALIDATION_ERROR',
        'El archivo no tiene un formato de backup válido.',
      );
    }
    const envelope = decoded as BackupEnvelopeV1;
    if ((await checksum(envelope.data)) !== envelope.checksum) {
      throw new ApplicationError(
        'VALIDATION_ERROR',
        'El checksum no coincide; el archivo está dañado.',
      );
    }
    validateReferences(envelope.data);
    return {
      envelope,
      summary: {
        players: envelope.data.players.length,
        teams: envelope.data.teams.length,
        matches: envelope.data.matches.length,
        events: envelope.data.matchEvents.length,
        settings: envelope.data.settings.length,
      },
    };
  }

  async replaceAll(envelope: BackupEnvelopeV1): Promise<void> {
    const preview = await this.preview(JSON.stringify(envelope));
    const { data, exportedAt } = preview.envelope;
    await this.db.transaction(
      'rw',
      [
        this.db.players,
        this.db.teams,
        this.db.matches,
        this.db.matchEvents,
        this.db.matchSnapshots,
        this.db.settings,
      ],
      async () => {
        await Promise.all([
          this.db.players.clear(),
          this.db.teams.clear(),
          this.db.matches.clear(),
          this.db.matchEvents.clear(),
          this.db.matchSnapshots.clear(),
          this.db.settings.clear(),
        ]);
        if (data.players.length) await this.db.players.bulkAdd([...data.players]);
        if (data.teams.length) await this.db.teams.bulkAdd([...data.teams]);
        if (data.matches.length) await this.db.matches.bulkAdd([...data.matches]);
        if (data.matchEvents.length) await this.db.matchEvents.bulkAdd([...data.matchEvents]);
        if (data.settings.length) await this.db.settings.bulkAdd([...data.settings]);

        for (const match of data.matches) {
          const events = data.matchEvents.filter((event) => event.matchId === match.id);
          const state = replay(match.initialState, events);
          await this.db.matchSnapshots.put({
            matchId: match.id,
            state,
            lastSequence: state.lastAppliedSequence,
            updatedAt: exportedAt,
          });
        }
      },
    );
  }
}
