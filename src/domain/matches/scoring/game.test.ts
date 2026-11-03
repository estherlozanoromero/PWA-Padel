import { describe, expect, it } from 'vitest';
import { displayPointLabels, reduceGamePoint } from '@/domain/matches/scoring/game';
import type { PointState } from '@/domain/matches/types';

describe('puntuación de un juego', () => {
  it('gana un juego ordinario con cuatro puntos directos', () => {
    let points: PointState = { raw: [0, 0], deuceStage: 'none' };
    let winner = null;

    for (let index = 0; index < 4; index += 1) {
      const result = reduceGamePoint(points, 'A', 'advantage', 'A', false);
      points = result.points;
      winner = result.gameWinner;
    }

    expect(winner).toBe('A');
    expect(points.raw).toEqual([4, 0]);
  });

  it('vuelve a iguales cuando se pierde una ventaja tradicional', () => {
    const deuce: PointState = { raw: [3, 3], deuceStage: 'deuce' };
    const advantage = reduceGamePoint(deuce, 'A', 'advantage', 'A', false);
    const backToDeuce = reduceGamePoint(advantage.points, 'B', 'advantage', 'A', false);

    expect(advantage.points.deuceStage).toBe('advantage_a');
    expect(backToDeuce.points.deuceStage).toBe('deuce');
    expect(backToDeuce.gameWinner).toBeNull();
  });

  it('recorre las dos ventajas de Star Point antes del punto decisivo', () => {
    let points: PointState = { raw: [3, 3], deuceStage: 'deuce_1' };

    points = reduceGamePoint(points, 'A', 'star_point', 'A', false).points;
    expect(points.deuceStage).toBe('advantage_1_a');
    points = reduceGamePoint(points, 'B', 'star_point', 'A', false).points;
    expect(points.deuceStage).toBe('deuce_2');
    points = reduceGamePoint(points, 'B', 'star_point', 'A', false).points;
    expect(points.deuceStage).toBe('advantage_2_b');
    const star = reduceGamePoint(points, 'A', 'star_point', 'A', false);

    expect(star.points.deuceStage).toBe('deuce_3_star');
    expect(star.pendingReceiverChoice).toEqual({ receivingSide: 'B', reason: 'star_point' });
    expect(star.points.raw[0] + star.points.raw[1]).toBe(10);
  });

  it('cubre todas las salidas de ventaja tradicional', () => {
    const deuce: PointState = { raw: [3, 3], deuceStage: 'deuce' };
    const advantageB = reduceGamePoint(deuce, 'B', 'advantage', 'B', false);
    expect(advantageB.points.deuceStage).toBe('advantage_b');
    expect(reduceGamePoint(advantageB.points, 'B', 'advantage', 'B', false).gameWinner).toBe('B');
    expect(reduceGamePoint(advantageB.points, 'A', 'advantage', 'B', false).points.deuceStage).toBe(
      'deuce',
    );

    const advantageA: PointState = { raw: [4, 3], deuceStage: 'advantage_a' };
    expect(reduceGamePoint(advantageA, 'A', 'advantage', 'A', false).gameWinner).toBe('A');
    expect(reduceGamePoint(advantageA, 'B', 'advantage', 'A', false).points.deuceStage).toBe(
      'deuce',
    );
  });

  it('gestiona ambos lados del punto de oro y exige decisión', () => {
    const beforeDeuce: PointState = { raw: [3, 2], deuceStage: 'none' };
    const deuce = reduceGamePoint(beforeDeuce, 'B', 'golden_point', 'B', false);
    expect(deuce.pendingReceiverChoice).toEqual({
      receivingSide: 'A',
      reason: 'golden_point',
    });
    expect(reduceGamePoint(deuce.points, 'A', 'golden_point', 'B', false).gameWinner).toBeNull();
    expect(reduceGamePoint(deuce.points, 'B', 'golden_point', 'B', true).gameWinner).toBe('B');
  });

  it('cubre todas las victorias y devoluciones de Star Point', () => {
    const at = (deuceStage: PointState['deuceStage'], raw: [number, number] = [3, 3]) => ({
      raw,
      deuceStage,
    });

    expect(reduceGamePoint(at('deuce_1'), 'B', 'star_point', 'A', false).points.deuceStage).toBe(
      'advantage_1_b',
    );
    expect(
      reduceGamePoint(at('advantage_1_a', [4, 3]), 'A', 'star_point', 'A', false).gameWinner,
    ).toBe('A');
    expect(
      reduceGamePoint(at('advantage_1_b', [3, 4]), 'B', 'star_point', 'A', false).gameWinner,
    ).toBe('B');
    expect(
      reduceGamePoint(at('advantage_1_b', [3, 4]), 'A', 'star_point', 'A', false).points.deuceStage,
    ).toBe('deuce_2');
    expect(reduceGamePoint(at('deuce_2'), 'A', 'star_point', 'A', false).points.deuceStage).toBe(
      'advantage_2_a',
    );
    expect(
      reduceGamePoint(at('advantage_2_a', [5, 4]), 'A', 'star_point', 'A', false).gameWinner,
    ).toBe('A');
    expect(
      reduceGamePoint(at('advantage_2_b', [4, 5]), 'B', 'star_point', 'A', false).gameWinner,
    ).toBe('B');
    expect(
      reduceGamePoint(at('advantage_2_a', [5, 4]), 'B', 'star_point', 'A', false).points.deuceStage,
    ).toBe('deuce_3_star');

    const star = at('deuce_3_star', [5, 5]);
    expect(
      reduceGamePoint(star, 'A', 'star_point', 'A', false).pendingReceiverChoice,
    ).not.toBeNull();
    expect(reduceGamePoint(star, 'B', 'star_point', 'A', true).gameWinner).toBe('B');
  });

  it('crea deuce tradicional y Star desde el marcador ordinario', () => {
    const beforeDeuce: PointState = { raw: [3, 2], deuceStage: 'none' };
    expect(reduceGamePoint(beforeDeuce, 'B', 'advantage', 'A', false).points.deuceStage).toBe(
      'deuce',
    );
    expect(reduceGamePoint(beforeDeuce, 'B', 'star_point', 'A', false).points.deuceStage).toBe(
      'deuce_1',
    );
    expect(
      reduceGamePoint({ raw: [0, 3], deuceStage: 'none' }, 'B', 'advantage', 'A', false).gameWinner,
    ).toBe('B');
    expect(
      reduceGamePoint({ raw: [0, 0], deuceStage: 'none' }, 'B', 'advantage', 'A', false).gameWinner,
    ).toBeNull();
  });

  it('rechaza combinaciones de estrategia y estado imposibles', () => {
    expect(() =>
      reduceGamePoint({ raw: [3, 3], deuceStage: 'deuce_1' }, 'A', 'advantage', 'A', false),
    ).toThrow(/incompatible/i);
    expect(() =>
      reduceGamePoint({ raw: [3, 3], deuceStage: 'deuce' }, 'A', 'star_point', 'A', false),
    ).toThrow(/incompatible/i);
  });

  it.each([
    ['advantage_a', ['AD', '40']],
    ['advantage_1_a', ['AD', '40']],
    ['advantage_2_a', ['AD', '40']],
    ['advantage_b', ['40', 'AD']],
    ['advantage_1_b', ['40', 'AD']],
    ['advantage_2_b', ['40', 'AD']],
    ['deuce', ['40', '40']],
    ['deuce_1', ['40', '40']],
    ['deuce_2', ['40', '40']],
    ['deuce_3_star', ['40', '40']],
  ] as const)('presenta correctamente el estado %s', (deuceStage, expected) => {
    expect(displayPointLabels({ raw: [3, 3], deuceStage })).toEqual(expected);
  });

  it('presenta 0, 15, 30 y 40 desde los puntos crudos', () => {
    expect(displayPointLabels({ raw: [0, 1], deuceStage: 'none' })).toEqual(['0', '15']);
    expect(displayPointLabels({ raw: [2, 3], deuceStage: 'none' })).toEqual(['30', '40']);
    expect(displayPointLabels({ raw: [8, 9], deuceStage: 'none' })).toEqual(['40', '40']);
    expect(displayPointLabels({ raw: [-1, 0], deuceStage: 'none' })).toEqual(['40', '0']);
    expect(displayPointLabels({ raw: [-1, -1], deuceStage: 'none' })).toEqual(['40', '40']);
  });
});
