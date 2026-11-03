import { opposite, type PlayerId, type Side } from '@/domain/common/types';
import type { MatchState, TeamSnapshot } from '@/domain/matches/types';

export interface BuildServiceOrderInput {
  teams: Readonly<{ A: TeamSnapshot; B: TeamSnapshot }>;
  firstServingSide: Side;
  firstServerId: PlayerId;
  otherTeamFirstServerId: PlayerId;
}

function teamPlayerIds(team: TeamSnapshot): readonly [PlayerId, PlayerId] {
  return [team.players[0].id, team.players[1].id];
}

function includesPlayer(team: TeamSnapshot, playerId: PlayerId): boolean {
  return team.players.some((player) => player.id === playerId);
}

function partnerOf(team: TeamSnapshot, playerId: PlayerId): PlayerId {
  return team.players[0].id === playerId ? team.players[1].id : team.players[0].id;
}

export function buildServiceOrder(
  input: BuildServiceOrderInput,
): readonly [PlayerId, PlayerId, PlayerId, PlayerId] | null {
  const firstTeam = input.teams[input.firstServingSide];
  const otherSide = opposite(input.firstServingSide);
  const otherTeam = input.teams[otherSide];

  if (!includesPlayer(firstTeam, input.firstServerId)) return null;
  if (!includesPlayer(otherTeam, input.otherTeamFirstServerId)) return null;

  const firstPartner = partnerOf(firstTeam, input.firstServerId);
  const otherPartner = partnerOf(otherTeam, input.otherTeamFirstServerId);
  return [input.firstServerId, input.otherTeamFirstServerId, firstPartner, otherPartner];
}

export function validateServiceOrder(
  teams: Readonly<{ A: TeamSnapshot; B: TeamSnapshot }>,
  firstServingSide: Side,
  order: readonly PlayerId[],
): boolean {
  if (order.length !== 4 || new Set(order).size !== 4) return false;

  const firstIds = new Set(teamPlayerIds(teams[firstServingSide]));
  const otherIds = new Set(teamPlayerIds(teams[opposite(firstServingSide)]));

  return order.every((playerId, index) =>
    index % 2 === 0 ? firstIds.has(playerId) : otherIds.has(playerId),
  );
}

export function playerSide(
  teams: Readonly<{ A: TeamSnapshot; B: TeamSnapshot }>,
  playerId: PlayerId,
): Side | null {
  if (includesPlayer(teams.A, playerId)) return 'A';
  if (includesPlayer(teams.B, playerId)) return 'B';
  return null;
}

export function tieBreakServerIndex(firstServerIndex: number, pointsPlayed: number): number {
  if (pointsPlayed === 0) return firstServerIndex;
  return (firstServerIndex + 1 + Math.floor((pointsPlayed - 1) / 2)) % 4;
}

export function currentServer(state: MatchState): PlayerId | null {
  const order = state.service.order;
  if (!order) return null;

  const set = state.sets[state.sets.length - 1];
  if (!set) return null;

  const inTieBreak = set.kind === 'super_tiebreak' || set.tieBreakPoints !== null;
  if (inTieBreak) {
    const firstIndex = state.service.tieBreakFirstServerIndex;
    if (firstIndex === null) return null;
    return order[tieBreakServerIndex(firstIndex, state.service.tieBreakPointsPlayed)]!;
  }

  return order[state.service.currentGameServerIndex] ?? null;
}
