import type { PlayerId, Side } from '@/domain/common/types';
import type { GroupMember, GroupScoringRules, RatingAdjustment } from '@/domain/groups/types';
import type { MatchState } from '@/domain/matches/types';
import type { Player } from '@/domain/players/types';

export interface GroupRankingMatch {
  state: MatchState;
  finishedAt: string;
}

export interface GroupRankingRow {
  memberId: GroupMember['id'];
  playerId: PlayerId;
  name: string;
  kind: GroupMember['kind'];
  played: number;
  won: number;
  lost: number;
  rankingPoints: number;
  elo: number;
}

function expectedScore(own: number, opponent: number): number {
  return 1 / (1 + 10 ** ((opponent - own) / 400));
}

function playerIds(state: MatchState, side: Side): readonly PlayerId[] {
  return state.teams[side].players.map((player) => player.id);
}

export function buildGroupRanking(input: {
  members: readonly GroupMember[];
  players: readonly Player[];
  matches: readonly GroupRankingMatch[];
  adjustments: readonly RatingAdjustment[];
  scoring: GroupScoringRules;
}): readonly GroupRankingRow[] {
  const playerById = new Map(input.players.map((player) => [player.id, player]));
  const memberByPlayer = new Map(input.members.map((member) => [member.playerId, member]));
  const rows = new Map<PlayerId, GroupRankingRow>();

  for (const member of input.members) {
    const player = playerById.get(member.playerId);
    if (!player) continue;
    rows.set(member.playerId, {
      memberId: member.id,
      playerId: member.playerId,
      name: player.name,
      kind: member.kind,
      played: 0,
      won: 0,
      lost: 0,
      rankingPoints: 0,
      elo: input.scoring.initialElo,
    });
  }

  const matches = [...input.matches].sort((a, b) => a.finishedAt.localeCompare(b.finishedAt));
  for (const match of matches) {
    if (match.state.status !== 'finished' || match.state.winner === null) continue;
    const idsA = playerIds(match.state, 'A');
    const idsB = playerIds(match.state, 'B');
    if (![...idsA, ...idsB].every((id) => memberByPlayer.has(id) && rows.has(id))) continue;

    const eloA = idsA.reduce((sum, id) => sum + (rows.get(id)?.elo ?? 0), 0) / idsA.length;
    const eloB = idsB.reduce((sum, id) => sum + (rows.get(id)?.elo ?? 0), 0) / idsB.length;
    const deltaA = Math.round(
      input.scoring.eloKFactor * ((match.state.winner === 'A' ? 1 : 0) - expectedScore(eloA, eloB)),
    );
    const deltaB = -deltaA;

    for (const side of ['A', 'B'] as const) {
      const won = match.state.winner === side;
      for (const id of side === 'A' ? idsA : idsB) {
        const row = rows.get(id);
        if (!row) continue;
        row.played += 1;
        row.won += won ? 1 : 0;
        row.lost += won ? 0 : 1;
        row.rankingPoints += won ? input.scoring.winPoints : input.scoring.lossPoints;
        row.elo += side === 'A' ? deltaA : deltaB;
      }
    }
  }

  const rowByMember = new Map([...rows.values()].map((row) => [row.memberId, row]));
  for (const adjustment of input.adjustments) {
    const row = rowByMember.get(adjustment.memberId);
    if (!row) continue;
    row.rankingPoints += adjustment.pointsDelta;
    row.elo += adjustment.eloDelta;
  }

  return [...rows.values()].sort(
    (a, b) =>
      b.rankingPoints - a.rankingPoints ||
      b.elo - a.elo ||
      b.won - a.won ||
      a.name.localeCompare(b.name),
  );
}
