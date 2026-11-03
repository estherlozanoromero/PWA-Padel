import {
  incrementPair,
  opposite,
  sideIndex,
  type PlayerId,
  type Side,
} from '@/domain/common/types';
import { setsToWin, validateRules } from '@/domain/matches/rules';
import {
  buildServiceOrder,
  currentServer,
  playerSide,
  validateServiceOrder,
} from '@/domain/matches/service';
import { reduceGamePoint } from '@/domain/matches/scoring/game';
import {
  currentSet,
  POINTS_ZERO,
  type CreateMatchInput,
  type DomainResult,
  type MatchState,
  type ReceiverDecision,
  type SetState,
} from '@/domain/matches/types';

function clonePointsZero() {
  return { raw: [0, 0] as const, deuceStage: POINTS_ZERO.deuceStage };
}

function createSet(index: number, kind: SetState['kind']): SetState {
  return {
    index,
    kind,
    games: [0, 0],
    tieBreakPoints: kind === 'super_tiebreak' ? [0, 0] : null,
    winner: null,
    completedAtSequence: null,
  };
}

function validateTeams(input: CreateMatchInput): boolean {
  const ids = [
    input.teams.A.players[0].id,
    input.teams.A.players[1].id,
    input.teams.B.players[0].id,
    input.teams.B.players[1].id,
  ];
  return new Set(ids).size === 4;
}

export function createInitialState(input: CreateMatchInput): MatchState {
  const ruleErrors = validateRules(input.rules);
  if (ruleErrors.length > 0) {
    throw new Error(`Reglas inválidas: ${ruleErrors.map((error) => error.message).join(' ')}`);
  }
  if (!validateTeams(input)) {
    throw new Error('Un partido necesita cuatro jugadores distintos.');
  }

  return {
    matchId: input.matchId,
    status: 'draft',
    resumeStatus: null,
    rules: { ...input.rules },
    teams: input.teams,
    sets: [createSet(0, 'normal')],
    setsWon: [0, 0],
    currentPoints: clonePointsZero(),
    service: {
      setIndex: 0,
      order: null,
      firstServingSide: 'A',
      currentGameServerIndex: 0,
      tieBreakFirstServerIndex: null,
      tieBreakPointsPlayed: 0,
      nextSetFirstServingSide: null,
    },
    pendingReceiverChoice: null,
    receiverDecision: null,
    winner: null,
    lastAppliedSequence: 0,
    sideChangeDue: false,
  };
}

export function startMatch(state: MatchState, firstServingSide: Side): MatchState {
  if (state.status !== 'draft') throw new Error('El partido ya se ha iniciado.');
  return {
    ...state,
    status: 'awaiting_set_service_order',
    service: { ...state.service, firstServingSide },
  };
}

export function configureSetService(
  state: MatchState,
  firstServerId: PlayerId,
  otherTeamFirstServerId: PlayerId,
): MatchState {
  if (state.status !== 'awaiting_set_service_order') {
    throw new Error('El partido no está esperando un orden de saque.');
  }

  const order = buildServiceOrder({
    teams: state.teams,
    firstServingSide: state.service.firstServingSide,
    firstServerId,
    otherTeamFirstServerId,
  });

  if (!order || !validateServiceOrder(state.teams, state.service.firstServingSide, order)) {
    throw new Error('El orden de saque no es válido.');
  }

  const set = currentSet(state);
  return {
    ...state,
    status: 'playing',
    service: {
      ...state.service,
      order,
      currentGameServerIndex: 0,
      tieBreakFirstServerIndex: set.kind === 'super_tiebreak' ? 0 : null,
      tieBreakPointsPlayed: 0,
      nextSetFirstServingSide: null,
    },
  };
}

function playerById(state: MatchState, playerId: PlayerId) {
  return [...state.teams.A.players, ...state.teams.B.players].find(
    (player) => player.id === playerId,
  );
}

function mixedMatchWithKnownGenders(state: MatchState): boolean {
  const isMixed = (side: Side) => {
    const genders = new Set(state.teams[side].players.map((player) => player.sportGender));
    return genders.has('male') && genders.has('female');
  };
  return isMixed('A') && isMixed('B');
}

export function chooseReceiver(
  state: MatchState,
  decision: Pick<ReceiverDecision, 'courtSide' | 'receiverPlayerId'>,
): MatchState {
  const validation = validateReceiverDecision(state, decision.receiverPlayerId);
  if (!validation.ok) throw new Error(validation.error.message);

  const pendingChoice = state.pendingReceiverChoice;
  if (!pendingChoice) throw new Error('No hay ningún punto decisivo esperando receptor.');

  return {
    ...state,
    status: 'playing',
    receiverDecision: {
      ...pendingChoice,
      courtSide: decision.courtSide,
      receiverPlayerId: decision.receiverPlayerId,
    },
    pendingReceiverChoice: null,
  };
}

export function hasWonByTarget(
  scoreA: number,
  scoreB: number,
  target: number,
  minLead: number,
): Side | null {
  if (scoreA >= target && scoreA - scoreB >= minLead) return 'A';
  if (scoreB >= target && scoreB - scoreA >= minLead) return 'B';
  return null;
}

export function hasWonNormalSet(
  games: readonly [number, number],
  target: number,
  minLead: number,
): Side | null {
  return hasWonByTarget(games[0], games[1], target, minLead);
}

function setAtEnd(state: MatchState, updated: SetState): readonly SetState[] {
  return state.sets.map((set, index) => (index === state.sets.length - 1 ? updated : set));
}

function isDecidingSet(rulesBestOf: 3 | 5, setsWon: readonly [number, number]): boolean {
  const neededBeforeDecider = Math.floor(rulesBestOf / 2);
  return setsWon[0] === neededBeforeDecider && setsWon[1] === neededBeforeDecider;
}

function completeSet(
  state: MatchState,
  completedSet: SetState,
  winner: Side,
  nextFirstServingSide: Side,
): MatchState {
  const setsWon = incrementPair(state.setsWon, winner);
  const wonMatch = setsWon[sideIndex(winner)] >= setsToWin(state.rules);
  const finishedSet = { ...completedSet, winner };
  const completedSets = setAtEnd(state, finishedSet);

  if (wonMatch) {
    return {
      ...state,
      status: 'finished',
      sets: completedSets,
      setsWon,
      winner,
      currentPoints: clonePointsZero(),
      pendingReceiverChoice: null,
      receiverDecision: null,
    };
  }

  const kind =
    state.rules.decidingSetMode === 'super_tiebreak' &&
    isDecidingSet(state.rules.bestOfSets, setsWon)
      ? 'super_tiebreak'
      : 'normal';
  const nextSet = createSet(completedSets.length, kind);

  return {
    ...state,
    status: 'awaiting_set_service_order',
    sets: [...completedSets, nextSet],
    setsWon,
    currentPoints: clonePointsZero(),
    service: {
      setIndex: nextSet.index,
      order: null,
      firstServingSide: nextFirstServingSide,
      currentGameServerIndex: 0,
      tieBreakFirstServerIndex: null,
      tieBreakPointsPlayed: 0,
      nextSetFirstServingSide: nextFirstServingSide,
    },
    pendingReceiverChoice: null,
    receiverDecision: null,
  };
}

function applyTieBreakPoint(state: MatchState, winner: Side): MatchState {
  const set = currentSet(state);
  const previous = set.tieBreakPoints ?? [0, 0];
  const tieBreakPoints = incrementPair(previous, winner);
  const pointsPlayed = state.service.tieBreakPointsPlayed + 1;
  const target =
    set.kind === 'super_tiebreak' ? state.rules.superTieBreakTarget : state.rules.tieBreakTarget;
  const minLead =
    set.kind === 'super_tiebreak' ? state.rules.superTieBreakMinLead : state.rules.tieBreakMinLead;
  const tieBreakWinner = hasWonByTarget(tieBreakPoints[0], tieBreakPoints[1], target, minLead);
  const updatedSet: SetState = { ...set, tieBreakPoints };
  const updatedState: MatchState = {
    ...state,
    sets: setAtEnd(state, updatedSet),
    service: { ...state.service, tieBreakPointsPlayed: pointsPlayed },
    sideChangeDue: pointsPlayed % 6 === 0,
  };

  if (!tieBreakWinner) return updatedState;

  const games = set.kind === 'normal' ? incrementPair(set.games, tieBreakWinner) : set.games;
  const finishedSet: SetState = { ...updatedSet, games };
  const firstIndex = state.service.tieBreakFirstServerIndex;
  const order = state.service.order;
  if (firstIndex === null || !order) throw new Error('Falta el primer sacador del tie-break.');
  const firstServer = order[firstIndex];
  if (!firstServer) throw new Error('El primer sacador del tie-break no existe.');
  const firstServerSide = playerSide(state.teams, firstServer);
  if (!firstServerSide) throw new Error('El primer sacador no pertenece al partido.');

  return completeSet(updatedState, finishedSet, tieBreakWinner, opposite(firstServerSide));
}

function applyNormalGamePoint(state: MatchState, winner: Side): MatchState {
  const serverId = currentServer(state);
  if (!serverId) throw new Error('No hay un sacador configurado.');
  const serverSide = playerSide(state.teams, serverId);
  if (!serverSide) throw new Error('El sacador no pertenece al partido.');

  const pointTransition = reduceGamePoint(
    state.currentPoints,
    winner,
    state.rules.deuceMode,
    serverSide,
    state.receiverDecision !== null,
  );

  if (pointTransition.pendingReceiverChoice) {
    return {
      ...state,
      status: 'awaiting_receiver_side',
      currentPoints: pointTransition.points,
      pendingReceiverChoice: pointTransition.pendingReceiverChoice,
      receiverDecision: null,
      sideChangeDue: false,
    };
  }

  if (!pointTransition.gameWinner) {
    return {
      ...state,
      currentPoints: pointTransition.points,
      sideChangeDue: false,
    };
  }

  const set = currentSet(state);
  const games = incrementPair(set.games, pointTransition.gameWinner);
  const nextServerIndex = (state.service.currentGameServerIndex + 1) % 4;
  const gameCount = games[0] + games[1];
  const updatedSet: SetState = { ...set, games };
  const afterGame: MatchState = {
    ...state,
    sets: setAtEnd(state, updatedSet),
    currentPoints: clonePointsZero(),
    service: { ...state.service, currentGameServerIndex: nextServerIndex },
    pendingReceiverChoice: null,
    receiverDecision: null,
    sideChangeDue: gameCount % 2 === 1,
  };

  if (
    state.rules.tieBreakEnabled &&
    games[0] === state.rules.tieBreakAtGames &&
    games[1] === state.rules.tieBreakAtGames
  ) {
    const tieBreakSet = { ...updatedSet, tieBreakPoints: [0, 0] as const };
    return {
      ...afterGame,
      sets: setAtEnd(afterGame, tieBreakSet),
      service: {
        ...afterGame.service,
        tieBreakFirstServerIndex: nextServerIndex,
        tieBreakPointsPlayed: 0,
      },
    };
  }

  const setWinner = hasWonNormalSet(games, state.rules.gamesToWinSet, state.rules.minGameLeadInSet);
  if (!setWinner) return afterGame;

  const order = state.service.order;
  if (!order) throw new Error('Falta el orden de saque del set.');
  const nextServer = order[nextServerIndex];
  if (!nextServer) throw new Error('No existe el siguiente sacador.');
  const nextSide = playerSide(state.teams, nextServer);
  if (!nextSide) throw new Error('El siguiente sacador no pertenece al partido.');
  return completeSet(afterGame, updatedSet, setWinner, nextSide);
}

export function applyPoint(state: MatchState, winner: Side): MatchState {
  if (state.status !== 'playing') throw new Error('El partido no acepta puntos ahora mismo.');
  const set = currentSet(state);
  if (set.kind === 'super_tiebreak' || set.tieBreakPoints !== null) {
    return applyTieBreakPoint(state, winner);
  }
  return applyNormalGamePoint(state, winner);
}

export function pauseMatch(state: MatchState): MatchState {
  if (state.status !== 'playing' && state.status !== 'awaiting_receiver_side') {
    throw new Error('El partido no se puede pausar en su estado actual.');
  }
  return { ...state, status: 'paused', resumeStatus: state.status };
}

export function resumeMatch(state: MatchState): MatchState {
  if (state.status !== 'paused' || !state.resumeStatus) {
    throw new Error('El partido no está pausado.');
  }
  return { ...state, status: state.resumeStatus, resumeStatus: null };
}

export function cancelMatch(state: MatchState): MatchState {
  if (state.status === 'finished' || state.status === 'cancelled') {
    throw new Error('El partido ya está en un estado terminal.');
  }
  return {
    ...state,
    status: 'cancelled',
    resumeStatus: null,
    pendingReceiverChoice: null,
    receiverDecision: null,
  };
}

export function validateReceiverDecision(
  state: MatchState,
  receiverPlayerId: PlayerId | null,
): DomainResult<void> {
  if (state.status !== 'awaiting_receiver_side' || !state.pendingReceiverChoice) {
    return {
      ok: false,
      error: { code: 'INVALID_STATUS', message: 'No se está esperando una elección de receptor.' },
    };
  }
  if (
    receiverPlayerId &&
    !state.teams[state.pendingReceiverChoice.receivingSide].players.some(
      (player) => player.id === receiverPlayerId,
    )
  ) {
    return {
      ok: false,
      error: {
        code: 'INVALID_RECEIVER',
        message: 'El receptor no pertenece a la pareja al resto.',
      },
    };
  }

  if (mixedMatchWithKnownGenders(state)) {
    const serverId = currentServer(state);
    const server = serverId ? playerById(state, serverId) : undefined;
    const receiver = receiverPlayerId ? playerById(state, receiverPlayerId) : undefined;
    if (!server || !receiver || server.sportGender !== receiver.sportGender) {
      return {
        ok: false,
        error: {
          code: 'INVALID_RECEIVER',
          message: 'En un partido mixto, receptor y sacador deben ser del mismo sexo.',
        },
      };
    }
  }
  return { ok: true, value: undefined };
}
