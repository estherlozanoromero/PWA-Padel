import type { PlayerId, Side } from '@/domain/common/types';
import { effectiveEvents, type StoredMatchEvent } from '@/domain/matches/events';
import type { MatchState, TeamSnapshot } from '@/domain/matches/types';

export interface BasicStats {
  played: number;
  won: number;
  lost: number;
  winRate: number | null;
  setsFor: number;
  setsAgainst: number;
  gamesFor: number;
  gamesAgainst: number;
  pointsFor: number;
  pointsAgainst: number;
}

export interface StatisticsMatch {
  state: MatchState;
  events: readonly StoredMatchEvent[];
}

export interface PlayerStatisticsRow extends BasicStats {
  playerId: PlayerId;
  name: string;
}

export interface TeamStatisticsRow extends BasicStats {
  canonicalKey: string;
  name: string;
}

export interface StatisticsReport {
  global: BasicStats;
  players: readonly PlayerStatisticsRow[];
  teams: readonly TeamStatisticsRow[];
}

function emptyStats(): BasicStats {
  return {
    played: 0,
    won: 0,
    lost: 0,
    winRate: null,
    setsFor: 0,
    setsAgainst: 0,
    gamesFor: 0,
    gamesAgainst: 0,
    pointsFor: 0,
    pointsAgainst: 0,
  };
}

function canonicalTeamKey(team: TeamSnapshot): string {
  return team.players
    .map((player) => player.id)
    .sort()
    .join('::');
}

function teamName(team: TeamSnapshot): string {
  return team.displayName ?? team.players.map((player) => player.name).join(' · ');
}

function sideTotals(match: StatisticsMatch, side: Side) {
  const index = side === 'A' ? 0 : 1;
  const other = index === 0 ? 1 : 0;
  const pointWinners = effectiveEvents(match.events).filter(
    (item) => item.event.type === 'POINT_AWARDED',
  );
  return {
    setsFor: match.state.setsWon[index] ?? 0,
    setsAgainst: match.state.setsWon[other] ?? 0,
    gamesFor: match.state.sets.reduce((total, set) => total + (set.games[index] ?? 0), 0),
    gamesAgainst: match.state.sets.reduce((total, set) => total + (set.games[other] ?? 0), 0),
    pointsFor: pointWinners.filter(
      (item) => item.event.type === 'POINT_AWARDED' && item.event.winner === side,
    ).length,
    pointsAgainst: pointWinners.filter(
      (item) => item.event.type === 'POINT_AWARDED' && item.event.winner !== side,
    ).length,
  };
}

function addMatch(stats: BasicStats, match: StatisticsMatch, side: Side): void {
  const totals = sideTotals(match, side);
  stats.played += 1;
  if (match.state.winner === side) stats.won += 1;
  else stats.lost += 1;
  stats.winRate = (stats.won / stats.played) * 100;
  stats.setsFor += totals.setsFor;
  stats.setsAgainst += totals.setsAgainst;
  stats.gamesFor += totals.gamesFor;
  stats.gamesAgainst += totals.gamesAgainst;
  stats.pointsFor += totals.pointsFor;
  stats.pointsAgainst += totals.pointsAgainst;
}

export function buildStatisticsReport(matches: readonly StatisticsMatch[]): StatisticsReport {
  const finished = matches.filter(
    (match) => match.state.status === 'finished' && match.state.winner !== null,
  );
  const global = emptyStats();
  const players = new Map<PlayerId, PlayerStatisticsRow>();
  const teams = new Map<string, TeamStatisticsRow>();

  for (const match of finished) {
    global.played += 1;
    global.setsFor += match.state.setsWon[0] + match.state.setsWon[1];
    global.gamesFor += match.state.sets.reduce((sum, set) => sum + set.games[0] + set.games[1], 0);
    global.pointsFor += effectiveEvents(match.events).filter(
      (item) => item.event.type === 'POINT_AWARDED',
    ).length;

    for (const side of ['A', 'B'] as const) {
      const team = match.state.teams[side];
      const key = canonicalTeamKey(team);
      const teamRow = teams.get(key) ?? {
        ...emptyStats(),
        canonicalKey: key,
        name: teamName(team),
      };
      addMatch(teamRow, match, side);
      teams.set(key, teamRow);

      for (const player of team.players) {
        const row = players.get(player.id) ?? {
          ...emptyStats(),
          playerId: player.id,
          name: player.name,
        };
        addMatch(row, match, side);
        players.set(player.id, row);
      }
    }
  }

  return {
    global,
    players: [...players.values()].sort((a, b) => b.won - a.won || a.name.localeCompare(b.name)),
    teams: [...teams.values()].sort((a, b) => b.won - a.won || a.name.localeCompare(b.name)),
  };
}
