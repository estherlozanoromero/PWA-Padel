import type { ISODateTime } from '@/domain/common/types';

export interface Clock {
  now(): ISODateTime;
}

export interface IdGenerator {
  next(): string;
}

export const systemClock: Clock = {
  now: () => new Date().toISOString() as ISODateTime,
};

export const cryptoIdGenerator: IdGenerator = {
  next: () => crypto.randomUUID(),
};
