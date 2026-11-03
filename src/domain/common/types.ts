export type Brand<T, Name extends string> = T & { readonly __brand: Name };

export type PlayerId = Brand<string, 'PlayerId'>;
export type TeamId = Brand<string, 'TeamId'>;
export type MatchId = Brand<string, 'MatchId'>;
export type EventId = Brand<string, 'EventId'>;
export type ISODateTime = Brand<string, 'ISODateTime'>;

export type Side = 'A' | 'B';
export type CourtSide = 'right' | 'left';

export function opposite(side: Side): Side {
  return side === 'A' ? 'B' : 'A';
}

export function sideIndex(side: Side): 0 | 1 {
  return side === 'A' ? 0 : 1;
}

export function incrementPair(
  pair: readonly [number, number],
  side: Side,
): readonly [number, number] {
  return side === 'A' ? [pair[0] + 1, pair[1]] : [pair[0], pair[1] + 1];
}
