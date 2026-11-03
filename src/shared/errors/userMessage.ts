export function userMessage(error: unknown, fallback: string): string {
  if (typeof error !== 'object' || error === null || !('name' in error)) return fallback;
  const name = typeof error.name === 'string' ? error.name : '';
  const message = 'message' in error && typeof error.message === 'string' ? error.message : '';
  switch (name) {
    case 'QuotaExceededError':
      return 'El almacenamiento local está lleno. Exporta un backup y libera espacio antes de continuar.';
    case 'AbortError':
    case 'TransactionInactiveError':
      return 'No se ha podido completar el guardado. Los datos anteriores siguen intactos; vuelve a intentarlo.';
    case 'DatabaseClosedError':
    case 'InvalidStateError':
      return 'La base de datos local no está disponible. Cierra otras pestañas de la aplicación y reintenta.';
    case 'VersionError':
      return 'Hay otra versión de la aplicación abierta. Cierra las demás pestañas y recarga.';
    default:
      return message || fallback;
  }
}
