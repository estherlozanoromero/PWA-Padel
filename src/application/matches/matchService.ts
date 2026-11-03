import type { EventId, MatchId } from '@/domain/common/types';
import {
  decide,
  evolve,
  replay,
  undoLastPoint,
  type MatchCommand,
  type MatchEvent,
  type StoredMatchEvent,
} from '@/domain/matches/events';
import { createInitialState } from '@/domain/matches/engine';
import type { MatchRules } from '@/domain/matches/rules';
import type { MatchState, MatchStatus, TeamSnapshot } from '@/domain/matches/types';
import { ApplicationError } from '@/application/errors';
import type {
  MatchTransactionRepositories,
  MatchUnitOfWork,
  RecoveredMatch,
} from '@/application/ports/repositories';
import type { MatchRecord } from '@/application/ports/records';
import type { Clock, IdGenerator } from '@/application/ports/system';

export interface CreateMatchInput {
  teams: { A: TeamSnapshot; B: TeamSnapshot };
  rules: MatchRules;
}

const recoverableStatuses: readonly MatchStatus[] = [
  'awaiting_set_service_order',
  'playing',
  'awaiting_receiver_side',
  'paused',
];

export class MatchService {
  constructor(
    private readonly unitOfWork: MatchUnitOfWork,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  create(input: CreateMatchInput): Promise<RecoveredMatch> {
    return this.unitOfWork.run(async (repositories) => {
      const now = this.clock.now();
      const matchId = this.ids.next() as MatchId;
      const initialState = createInitialState({
        matchId,
        teams: input.teams,
        rules: input.rules,
      });
      const record: MatchRecord = {
        id: matchId,
        status: initialState.status,
        rules: { ...input.rules },
        teams: input.teams,
        initialState,
        startedAt: null,
        finishedAt: null,
        cancelledAt: null,
        winner: null,
        createdAt: now,
        updatedAt: now,
      };
      await repositories.matches.put(record);
      await repositories.snapshots.put({
        matchId,
        state: initialState,
        lastSequence: 0,
        updatedAt: now,
      });
      return { record, state: initialState };
    });
  }

  execute(matchId: MatchId, command: MatchCommand): Promise<RecoveredMatch> {
    return this.unitOfWork.run(async (repositories) => {
      const record = await this.requireMatch(repositories, matchId);
      const history = await repositories.events.listByMatch(matchId);
      const state = await this.loadState(repositories, record, history);
      const decision = decide(state, command);
      if (!decision.ok) {
        throw new ApplicationError('VALIDATION_ERROR', decision.error.message);
      }

      const occurredAt = this.clock.now();
      const nextSequence = (history.at(-1)?.sequence ?? 0) + 1;
      const events = decision.value.map((event, index) =>
        this.storeEvent(matchId, nextSequence + index, occurredAt, event),
      );
      await repositories.events.appendMany(events);
      const nextState = events.reduce(evolve, state);
      const nextRecord = this.updateRecord(record, nextState, occurredAt);
      await repositories.snapshots.put({
        matchId,
        state: nextState,
        lastSequence: nextState.lastAppliedSequence,
        updatedAt: occurredAt,
      });
      await repositories.matches.put(nextRecord);
      return { record: nextRecord, state: nextState };
    });
  }

  undo(matchId: MatchId): Promise<RecoveredMatch> {
    return this.unitOfWork.run(async (repositories) => {
      const record = await this.requireMatch(repositories, matchId);
      const history = await repositories.events.listByMatch(matchId);
      const plan = undoLastPoint(history);
      if (!plan.ok) throw new ApplicationError('VALIDATION_ERROR', plan.error.message);

      const occurredAt = this.clock.now();
      let sequence = (history.at(-1)?.sequence ?? 0) + 1;
      const reversions = plan.value.targetEventIds.map((targetEventId) => {
        const stored = this.storeEvent(matchId, sequence, occurredAt, {
          type: 'EVENT_REVERTED',
          targetEventId,
        });
        sequence += 1;
        return stored;
      });
      await repositories.events.appendMany(reversions);
      const nextState = replay(record.initialState, [...history, ...reversions]);
      const nextRecord = this.updateRecord(record, nextState, occurredAt);
      await repositories.snapshots.put({
        matchId,
        state: nextState,
        lastSequence: nextState.lastAppliedSequence,
        updatedAt: occurredAt,
      });
      await repositories.matches.put(nextRecord);
      return { record: nextRecord, state: nextState };
    });
  }

  recover(matchId: MatchId): Promise<RecoveredMatch> {
    return this.unitOfWork.run(async (repositories) => {
      const record = await this.requireMatch(repositories, matchId);
      const history = await repositories.events.listByMatch(matchId);
      const state = replay(record.initialState, history);
      const now = this.clock.now();
      const snapshot = await repositories.snapshots.get(matchId);
      const snapshotIsValid =
        snapshot?.lastSequence === state.lastAppliedSequence &&
        JSON.stringify(snapshot.state) === JSON.stringify(state);
      if (!snapshotIsValid) {
        await repositories.snapshots.put({
          matchId,
          state,
          lastSequence: state.lastAppliedSequence,
          updatedAt: now,
        });
      }
      const nextRecord = this.updateRecord(record, state, now);
      if (JSON.stringify(record) !== JSON.stringify(nextRecord)) {
        await repositories.matches.put(nextRecord);
      }
      return { record: nextRecord, state };
    });
  }

  listRecoverable(): Promise<readonly MatchRecord[]> {
    return this.unitOfWork.run((repositories) =>
      repositories.matches.listByStatuses(recoverableStatuses),
    );
  }

  private async loadState(
    repositories: MatchTransactionRepositories,
    record: MatchRecord,
    history: readonly StoredMatchEvent[],
  ): Promise<MatchState> {
    const snapshot = await repositories.snapshots.get(record.id);
    const lastSequence = history.at(-1)?.sequence ?? 0;
    const rebuilt = replay(record.initialState, history);
    if (
      snapshot?.lastSequence === lastSequence &&
      JSON.stringify(snapshot.state) === JSON.stringify(rebuilt)
    ) {
      return snapshot.state;
    }
    return rebuilt;
  }

  private async requireMatch(
    repositories: MatchTransactionRepositories,
    matchId: MatchId,
  ): Promise<MatchRecord> {
    const match = await repositories.matches.get(matchId);
    if (!match) throw new ApplicationError('NOT_FOUND', 'No se ha encontrado el partido.');
    return match;
  }

  private storeEvent(
    matchId: MatchId,
    sequence: number,
    occurredAt: ReturnType<Clock['now']>,
    event: MatchEvent,
  ): StoredMatchEvent {
    return {
      id: this.ids.next() as EventId,
      matchId,
      sequence,
      occurredAt,
      schemaVersion: 1,
      event,
    };
  }

  private updateRecord(
    record: MatchRecord,
    state: MatchState,
    now: ReturnType<Clock['now']>,
  ): MatchRecord {
    return {
      ...record,
      status: state.status,
      startedAt: record.startedAt ?? (state.status === 'draft' ? null : now),
      finishedAt: state.status === 'finished' ? (record.finishedAt ?? now) : null,
      cancelledAt: state.status === 'cancelled' ? (record.cancelledAt ?? now) : null,
      winner: state.winner,
      updatedAt: now,
    };
  }
}
