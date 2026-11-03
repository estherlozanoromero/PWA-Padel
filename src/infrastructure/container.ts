import { MatchService } from '@/application/matches/matchService';
import { PlayerService } from '@/application/players/playerService';
import { cryptoIdGenerator, systemClock } from '@/application/ports/system';
import { TeamService } from '@/application/teams/teamService';
import { BackupService } from '@/application/backup/backupService';
import { database } from '@/infrastructure/database/dexie/database';
import {
  DexiePlayerRepository,
  DexieTeamRepository,
} from '@/infrastructure/repositories/dexieRepositories';
import { DexieMatchUnitOfWork } from '@/infrastructure/repositories/dexieUnitOfWork';

export const playerRepository = new DexiePlayerRepository(database);
export const teamRepository = new DexieTeamRepository(database);
export const matchUnitOfWork = new DexieMatchUnitOfWork(database);

export const playerService = new PlayerService(playerRepository, systemClock, cryptoIdGenerator);
export const teamService = new TeamService(
  teamRepository,
  playerRepository,
  systemClock,
  cryptoIdGenerator,
);
export const matchService = new MatchService(matchUnitOfWork, systemClock, cryptoIdGenerator);
export const backupService = new BackupService(database, systemClock);
