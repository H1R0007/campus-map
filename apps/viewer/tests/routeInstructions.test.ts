import { describe, expect, it } from 'vitest';
import { formatDuration } from '../src/utils/routeInstructions';

/**
 * Время в пути в карточке маршрута.
 *
 * Само время считает ядро; здесь проверяется только то, как его увидит
 * студент.
 */
describe('formatDuration', () => {
  it('округляет вверх до минуты: опоздать хуже, чем прийти раньше', () => {
    expect(formatDuration(61)).toBe('~2 мин');
    expect(formatDuration(120)).toBe('~2 мин');
  });

  it('короткий маршрут показывается минутой, а не нулём', () => {
    expect(formatDuration(0)).toBe('~1 мин');
    expect(formatDuration(25)).toBe('~1 мин');
  });
});
