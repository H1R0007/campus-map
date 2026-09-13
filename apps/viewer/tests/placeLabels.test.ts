import { describe, expect, it } from 'vitest';
import type { BuildingMeta } from '@campus-map/core';
import { nodePlaceLabel, scopeLabel } from '../src/utils/placeLabels';
import { fixtureGraph } from './helpers/graphFixture';

/**
 * Подписи мест на языке интерфейса.
 */

const BUILDINGS = new Map<string, BuildingMeta>([
  [
    'building_a',
    {
      id: 'building_a',
      name: 'Корпус А',
      translations: { en: { name: 'Building A' } },
      floors: [{ floor: -1 }, { floor: 1 }, { floor: 2 }],
    },
  ],
]);

describe('scopeLabel', () => {
  it('территория — словом из словаря', () => {
    expect(scopeLabel({ mode: 'campus' }, BUILDINGS, 'ru')).toBe('Кампус');
    expect(scopeLabel({ mode: 'campus' }, BUILDINGS, 'en')).toBe('Campus');
  });

  it('этаж — переведённым именем корпуса', () => {
    const scope = { mode: 'floor', buildingId: 'building_a', floor: 2 } as const;

    expect(scopeLabel(scope, BUILDINGS, 'ru')).toBe('Корпус А, этаж 2');
    expect(scopeLabel(scope, BUILDINGS, 'en')).toBe('Building A, floor 2');
  });

  it('подземный этаж — с минусом', () => {
    expect(scopeLabel({ mode: 'floor', buildingId: 'building_a', floor: -1 }, BUILDINGS, 'ru')).toBe(
      'Корпус А, этаж −1'
    );
  });

  it('неизвестный корпус показывается своим id — ошибку данных видно', () => {
    expect(scopeLabel({ mode: 'floor', buildingId: 'building_z', floor: 1 }, BUILDINGS, 'en')).toBe(
      'building_z, floor 1'
    );
  });
});

describe('nodePlaceLabel', () => {
  it('подписывает узел местом, где он находится', () => {
    const graph = fixtureGraph();

    expect(nodePlaceLabel(graph, BUILDINGS, 'a2_room201', 'en')).toBe('Building A, floor 2');
    expect(nodePlaceLabel(graph, BUILDINGS, 'campus_gate', 'ru')).toBe('Кампус');
    expect(nodePlaceLabel(graph, BUILDINGS, 'no_such_node', 'ru')).toBe('');
  });
});
