import { describe, expect, it } from 'vitest';
import {
  createRules,
  RULES_PRESETS,
  setsToWin,
  validateRules,
  type MatchRules,
} from '@/domain/matches/rules';

describe('reglas del partido', () => {
  it('expone cinco presets válidos como copias independientes', () => {
    expect(Object.keys(RULES_PRESETS)).toHaveLength(5);
    const rules = createRules('star_2026_super_tiebreak');
    expect(rules.deuceMode).toBe('star_point');
    expect(rules.decidingSetMode).toBe('super_tiebreak');
    expect(validateRules(rules)).toEqual([]);
    expect(rules).not.toBe(RULES_PRESETS.star_2026_super_tiebreak);
  });

  it('devuelve conjuntamente todos los errores de una configuración incoherente', () => {
    const invalid = {
      ...createRules('classic_best_of_3'),
      schemaVersion: 2,
      bestOfSets: 4,
      gamesToWinSet: 0,
      minGameLeadInSet: 0,
      tieBreakAtGames: -1,
      tieBreakTarget: 0,
      tieBreakMinLead: 0,
      superTieBreakTarget: 0,
      superTieBreakMinLead: 0,
    } as unknown as MatchRules;

    expect(validateRules(invalid).map((error) => error.field)).toEqual([
      'schemaVersion',
      'bestOfSets',
      'gamesToWinSet',
      'minGameLeadInSet',
      'tieBreakAtGames',
      'tieBreakTarget',
      'tieBreakMinLead',
      'superTieBreakTarget',
      'superTieBreakMinLead',
    ]);
  });

  it('permite desactivar el tie-break sin validar su punto de inicio', () => {
    const rules = {
      ...createRules('classic_best_of_3'),
      tieBreakEnabled: false,
      tieBreakAtGames: 0,
    };
    expect(validateRules(rules)).toEqual([]);
  });

  it('calcula los sets necesarios en formatos de tres y cinco', () => {
    expect(setsToWin(createRules('classic_best_of_3'))).toBe(2);
    expect(setsToWin({ ...createRules('classic_best_of_3'), bestOfSets: 5 })).toBe(3);
  });
});
