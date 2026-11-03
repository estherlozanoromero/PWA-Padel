import type { ISODateTime, PlayerId } from '@/domain/common/types';

export type SportGender = 'male' | 'female' | 'unspecified';

export interface Player {
  id: PlayerId;
  name: string;
  normalizedName: string;
  sportGender: SportGender;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  archivedAt: ISODateTime | null;
}

export function normalizePlayerName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es');
}
