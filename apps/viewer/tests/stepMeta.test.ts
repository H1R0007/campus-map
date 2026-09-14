import { describe, expect, it } from 'vitest';
import type { RouteStep } from '../src/utils/routeInstructions';
import { stepMeta } from '../src/utils/routeSummary';

/**
 * Подпись шага справа: длина пешего участка или время перехода.
 */
function step(overrides: Partial<RouteStep>): RouteStep {
  return {
    kind: 'walk',
    title: '',
    place: '',
    transition: null,
    scope: { mode: 'campus' },
    distanceMeters: null,
    durationSeconds: null,
    pathRange: [0, 1],
    ...overrides,
  };
}

describe('stepMeta', () => {
  it('у пешего участка — длина, у перехода — время', () => {
    expect(stepMeta(step({ kind: 'walk', distanceMeters: 42, durationSeconds: 30 }), 'ru')).toBe('40 м');
    expect(stepMeta(step({ kind: 'transition', transition: 'lift', distanceMeters: 0, durationSeconds: 70 }), 'en')).toBe('~2 min');
  });

  it('в пиксельном режиме и у начала подписи нет', () => {
    expect(stepMeta(step({ kind: 'walk' }), 'ru')).toBeNull();
    expect(stepMeta(step({ kind: 'start', distanceMeters: 5, durationSeconds: 5 }), 'ru')).toBeNull();
  });
});
