import { describe, expect, it } from 'vitest';
import { userMessage } from '@/shared/errors/userMessage';

describe('userMessage', () => {
  it('convierte errores de cuota y transacción en acciones recuperables', () => {
    expect(userMessage(new DOMException('full', 'QuotaExceededError'), 'fallo')).toContain('lleno');
    expect(userMessage(new DOMException('abort', 'AbortError'), 'fallo')).toContain(
      'vuelve a intentarlo',
    );
  });

  it('conserva mensajes conocidos y usa un fallback para valores desconocidos', () => {
    expect(userMessage(new Error('Detalle útil'), 'fallo')).toBe('Detalle útil');
    expect(userMessage(null, 'fallo')).toBe('fallo');
  });
});
