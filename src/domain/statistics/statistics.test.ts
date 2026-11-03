import { describe, expect, it } from 'vitest';
import { buildStatisticsReport } from '@/domain/statistics/statistics';
import { createPlayingMatch, stored } from '@/domain/matches/test/fixtures';
import type { MatchState } from '@/domain/matches/types';

function finishedState(): MatchState {
  const base = createPlayingMatch();
  return {
    ...base,
    status: 'finished',
    winner: 'A',
    setsWon: [2, 1],
    sets: [
      {
        index: 0,
        kind: 'normal',
        games: [6, 4],
        tieBreakPoints: null,
        winner: 'A',
        completedAtSequence: 1,
      },
      {
        index: 1,
        kind: 'normal',
        games: [6, 7],
        tieBreakPoints: [5, 7],
        winner: 'B',
        completedAtSequence: 2,
      },
      {
        index: 2,
        kind: 'super_tiebreak',
        games: [0, 0],
        tieBreakPoints: [10, 8],
        winner: 'A',
        completedAtSequence: 3,
      },
    ],
  };
}

describe('buildStatisticsReport', () => {
  it('calcula jugadores y parejas incluyendo el super tie-break como set pero no como juegos', () => {
    const state = finishedState();
    const events = [
      stored(1, { type: 'POINT_AWARDED', winner: 'A' }),
      stored(2, { type: 'POINT_AWARDED', winner: 'B' }),
      stored(3, { type: 'POINT_AWARDED', winner: 'A' }),
    ];
    const report = buildStatisticsReport([{ state, events }]);

    expect(report.global).toMatchObject({ played: 1, setsFor: 3, gamesFor: 23, pointsFor: 3 });
    expect(report.players).toHaveLength(4);
    expect(report.players.find((row) => row.name === 'Ana')).toMatchObject({
      played: 1,
      won: 1,
      setsFor: 2,
      setsAgainst: 1,
      gamesFor: 12,
      gamesAgainst: 11,
      pointsFor: 2,
      pointsAgainst: 1,
      winRate: 100,
    });
  });

  it('excluye partidos en curso y cancelados', () => {
    const playing = createPlayingMatch();
    const cancelled = { ...playing, status: 'cancelled' as const };
    expect(
      buildStatisticsReport([
        { state: playing, events: [] },
        { state: cancelled, events: [] },
      ]),
    ).toEqual({
      global: expect.objectContaining({ played: 0 }),
      players: [],
      teams: [],
    });
  });
});
