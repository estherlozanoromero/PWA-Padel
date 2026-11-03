export type ApplicationErrorCode =
  'VALIDATION_ERROR' | 'NOT_FOUND' | 'PLAYER_ARCHIVED' | 'STORAGE_ERROR';

export class ApplicationError extends Error {
  constructor(
    public readonly code: ApplicationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ApplicationError';
  }
}
