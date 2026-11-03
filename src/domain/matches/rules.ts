export type DeuceMode = 'advantage' | 'golden_point' | 'star_point';
export type DecidingSetMode = 'normal_set' | 'super_tiebreak';

export interface MatchRules {
  schemaVersion: 1;
  bestOfSets: 1 | 3 | 5;
  deuceMode: DeuceMode;
  gamesToWinSet: number;
  minGameLeadInSet: number;
  tieBreakEnabled: boolean;
  tieBreakAtGames: number;
  tieBreakTarget: number;
  tieBreakMinLead: number;
  decidingSetMode: DecidingSetMode;
  superTieBreakTarget: number;
  superTieBreakMinLead: number;
}

export type RulesPresetId =
  | 'classic_single_set'
  | 'golden_single_set'
  | 'star_2026_single_set'
  | 'classic_best_of_3'
  | 'golden_best_of_3'
  | 'star_2026_best_of_3'
  | 'golden_super_tiebreak'
  | 'star_2026_super_tiebreak';

const baseRules: Omit<MatchRules, 'deuceMode' | 'decidingSetMode'> = {
  schemaVersion: 1,
  bestOfSets: 3,
  gamesToWinSet: 6,
  minGameLeadInSet: 2,
  tieBreakEnabled: true,
  tieBreakAtGames: 6,
  tieBreakTarget: 7,
  tieBreakMinLead: 2,
  superTieBreakTarget: 10,
  superTieBreakMinLead: 2,
};

export const RULES_PRESETS: Readonly<Record<RulesPresetId, Readonly<MatchRules>>> = {
  classic_single_set: {
    ...baseRules,
    bestOfSets: 1,
    deuceMode: 'advantage',
    decidingSetMode: 'normal_set',
  },
  golden_single_set: {
    ...baseRules,
    bestOfSets: 1,
    deuceMode: 'golden_point',
    decidingSetMode: 'normal_set',
  },
  star_2026_single_set: {
    ...baseRules,
    bestOfSets: 1,
    deuceMode: 'star_point',
    decidingSetMode: 'normal_set',
  },
  classic_best_of_3: {
    ...baseRules,
    deuceMode: 'advantage',
    decidingSetMode: 'normal_set',
  },
  golden_best_of_3: {
    ...baseRules,
    deuceMode: 'golden_point',
    decidingSetMode: 'normal_set',
  },
  star_2026_best_of_3: {
    ...baseRules,
    deuceMode: 'star_point',
    decidingSetMode: 'normal_set',
  },
  golden_super_tiebreak: {
    ...baseRules,
    deuceMode: 'golden_point',
    decidingSetMode: 'super_tiebreak',
  },
  star_2026_super_tiebreak: {
    ...baseRules,
    deuceMode: 'star_point',
    decidingSetMode: 'super_tiebreak',
  },
};

export interface RuleValidationError {
  field: keyof MatchRules;
  message: string;
}

export function createRules(preset: RulesPresetId): MatchRules {
  return { ...RULES_PRESETS[preset] };
}

export function validateRules(rules: MatchRules): readonly RuleValidationError[] {
  const errors: RuleValidationError[] = [];

  if (rules.schemaVersion !== 1) {
    errors.push({ field: 'schemaVersion', message: 'La versión de reglas no es compatible.' });
  }

  if (rules.bestOfSets !== 1 && rules.bestOfSets !== 3 && rules.bestOfSets !== 5) {
    errors.push({
      field: 'bestOfSets',
      message: 'El partido debe ser a 1 set o al mejor de 3 o 5.',
    });
  }

  if (rules.gamesToWinSet < 1) {
    errors.push({ field: 'gamesToWinSet', message: 'El objetivo de juegos debe ser positivo.' });
  }

  if (rules.minGameLeadInSet < 1) {
    errors.push({
      field: 'minGameLeadInSet',
      message: 'La diferencia mínima de juegos debe ser positiva.',
    });
  }

  if (rules.tieBreakEnabled && rules.tieBreakAtGames < rules.gamesToWinSet) {
    errors.push({
      field: 'tieBreakAtGames',
      message: 'El tie-break no puede empezar antes del objetivo de juegos del set.',
    });
  }

  if (rules.tieBreakTarget < 1) {
    errors.push({
      field: 'tieBreakTarget',
      message: 'El objetivo del tie-break debe ser positivo.',
    });
  }

  if (rules.tieBreakMinLead < 1) {
    errors.push({
      field: 'tieBreakMinLead',
      message: 'La diferencia mínima del tie-break debe ser positiva.',
    });
  }

  if (rules.superTieBreakTarget < 1) {
    errors.push({
      field: 'superTieBreakTarget',
      message: 'El objetivo del super tie-break debe ser positivo.',
    });
  }

  if (rules.superTieBreakMinLead < 1) {
    errors.push({
      field: 'superTieBreakMinLead',
      message: 'La diferencia mínima del super tie-break debe ser positiva.',
    });
  }

  return errors;
}

export function setsToWin(rules: MatchRules): number {
  return Math.floor(rules.bestOfSets / 2) + 1;
}
