import type {
  MatchTransactionRepositories,
  MatchUnitOfWork,
} from '@/application/ports/repositories';
import type { PadelDatabase } from '@/infrastructure/database/dexie/database';
import {
  DexieMatchEventRepository,
  DexieMatchRepository,
  DexieSnapshotRepository,
} from '@/infrastructure/repositories/dexieRepositories';

export class DexieMatchUnitOfWork implements MatchUnitOfWork {
  private readonly repositories: MatchTransactionRepositories;

  constructor(private readonly db: PadelDatabase) {
    this.repositories = {
      matches: new DexieMatchRepository(db),
      events: new DexieMatchEventRepository(db),
      snapshots: new DexieSnapshotRepository(db),
    };
  }

  run<T>(work: (repositories: MatchTransactionRepositories) => Promise<T>): Promise<T> {
    return this.db.transaction(
      'rw',
      [this.db.matches, this.db.matchEvents, this.db.matchSnapshots],
      () => work(this.repositories),
    );
  }
}
