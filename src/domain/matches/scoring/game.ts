import { incrementPair, opposite, type Side } from '@/domain/common/types';
import type { DeuceMode } from '@/domain/matches/rules';
import type { PendingReceiverChoice, PointState } from '@/domain/matches/types';

export interface GamePointTransition {
  points: PointState;
  gameWinner: Side | null;
  pendingReceiverChoice: PendingReceiverChoice | null;
}

function transition(
  points: PointState,
  gameWinner: Side | null = null,
  pendingReceiverChoice: PendingReceiverChoice | null = null,
): GamePointTransition {
  return { points, gameWinner, pendingReceiverChoice };
}

function receivingSide(serverSide: Side): Side {
  return opposite(serverSide);
}

export function reduceGamePoint(
  state: PointState,
  winner: Side,
  mode: DeuceMode,
  serverSide: Side,
  receiverChoiceMade: boolean,
): GamePointTransition {
  const raw = incrementPair(state.raw, winner);

  if (state.deuceStage === 'none') {
    if (raw[0] === 3 && raw[1] === 3) {
      if (mode === 'star_point') return transition({ raw, deuceStage: 'deuce_1' });
      if (mode === 'golden_point') {
        return transition({ raw, deuceStage: 'deuce' }, null, {
          receivingSide: receivingSide(serverSide),
          reason: 'golden_point',
        });
      }
      return transition({ raw, deuceStage: 'deuce' });
    }

    if ((raw[0] >= 4 || raw[1] >= 4) && Math.min(raw[0], raw[1]) <= 2) {
      return transition({ raw, deuceStage: 'none' }, winner);
    }

    return transition({ raw, deuceStage: 'none' });
  }

  if (mode === 'advantage') {
    if (state.deuceStage === 'deuce') {
      return transition({ raw, deuceStage: winner === 'A' ? 'advantage_a' : 'advantage_b' });
    }

    if (state.deuceStage === 'advantage_a') {
      return winner === 'A'
        ? transition({ raw, deuceStage: 'advantage_a' }, 'A')
        : transition({ raw, deuceStage: 'deuce' });
    }

    if (state.deuceStage === 'advantage_b') {
      return winner === 'B'
        ? transition({ raw, deuceStage: 'advantage_b' }, 'B')
        : transition({ raw, deuceStage: 'deuce' });
    }
  }

  if (mode === 'golden_point' && state.deuceStage === 'deuce') {
    if (!receiverChoiceMade) {
      return transition(state, null, {
        receivingSide: receivingSide(serverSide),
        reason: 'golden_point',
      });
    }
    return transition({ raw, deuceStage: 'deuce' }, winner);
  }

  if (mode === 'star_point') {
    switch (state.deuceStage) {
      case 'deuce_1':
        return transition({
          raw,
          deuceStage: winner === 'A' ? 'advantage_1_a' : 'advantage_1_b',
        });
      case 'advantage_1_a':
        return winner === 'A'
          ? transition({ raw, deuceStage: 'advantage_1_a' }, 'A')
          : transition({ raw, deuceStage: 'deuce_2' });
      case 'advantage_1_b':
        return winner === 'B'
          ? transition({ raw, deuceStage: 'advantage_1_b' }, 'B')
          : transition({ raw, deuceStage: 'deuce_2' });
      case 'deuce_2':
        return transition({
          raw,
          deuceStage: winner === 'A' ? 'advantage_2_a' : 'advantage_2_b',
        });
      case 'advantage_2_a':
        if (winner === 'A') return transition({ raw, deuceStage: 'advantage_2_a' }, 'A');
        return transition({ raw, deuceStage: 'deuce_3_star' }, null, {
          receivingSide: receivingSide(serverSide),
          reason: 'star_point',
        });
      case 'advantage_2_b':
        if (winner === 'B') return transition({ raw, deuceStage: 'advantage_2_b' }, 'B');
        return transition({ raw, deuceStage: 'deuce_3_star' }, null, {
          receivingSide: receivingSide(serverSide),
          reason: 'star_point',
        });
      case 'deuce_3_star':
        if (!receiverChoiceMade) {
          return transition(state, null, {
            receivingSide: receivingSide(serverSide),
            reason: 'star_point',
          });
        }
        return transition({ raw, deuceStage: 'deuce_3_star' }, winner);
      default:
        break;
    }
  }

  throw new Error(`Estado de puntuación incompatible: ${mode}/${state.deuceStage}`);
}

export function displayPointLabels(points: PointState): readonly [string, string] {
  const base = ['0', '15', '30', '40'] as const;

  switch (points.deuceStage) {
    case 'advantage_a':
    case 'advantage_1_a':
    case 'advantage_2_a':
      return ['AD', '40'];
    case 'advantage_b':
    case 'advantage_1_b':
    case 'advantage_2_b':
      return ['40', 'AD'];
    case 'deuce':
    case 'deuce_1':
    case 'deuce_2':
    case 'deuce_3_star':
      return ['40', '40'];
    case 'none':
      return [base[Math.min(points.raw[0], 3)] ?? '40', base[Math.min(points.raw[1], 3)] ?? '40'];
  }
}
