import { describe, expect, it } from 'vitest';
import { AliasManager, findPath } from '@campus-map/core';
import type { BuildingMeta } from '@campus-map/core';
import { buildRouteSteps, formatDuration } from '../src/utils/routeInstructions';
import { fixtureGraph } from './helpers/graphFixture';

/**
 * Время в пути в карточке маршрута.
 *
 * Само время считает ядро; здесь проверяется только то, как его увидит
 * студент.
 */
describe('formatDuration', () => {
  it('округляет вверх до минуты: опоздать хуже, чем прийти раньше', () => {
    expect(formatDuration(61, 'ru')).toBe('~2 мин');
    expect(formatDuration(120, 'en')).toBe('~2 min');
  });

  it('короткий маршрут показывается минутой, а не нулём', () => {
    expect(formatDuration(0, 'ru')).toBe('~1 мин');
    expect(formatDuration(25, 'en')).toBe('~1 min');
  });
});

describe('buildRouteSteps', () => {
  const BUILDINGS = new Map<string, BuildingMeta>([
    [
      'building_a',
      {
        id: 'building_a',
        name: 'Корпус А',
        translations: { en: { name: 'Building A' } },
        floors: [{ floor: 1 }, { floor: 2 }],
      },
    ],
  ]);

  function steps(language: 'ru' | 'en'): string[] {
    const graph = fixtureGraph();
    const aliasManager = new AliasManager();
    aliasManager.load([
      { id: 'campus_gate', names: ['Главный вход'], translations: { en: { names: ['Main gate'] } } },
      { id: 'a2_room201', names: ['А-201'] },
    ]);

    return buildRouteSteps({
      graph,
      path: findPath(graph, 'campus_gate', 'a2_room201').path,
      buildingMetas: BUILDINGS,
      aliasManager,
      language,
    }).map((s) => s.text);
  }

  it('имена из данных стоят отдельно от действия и не склоняются', () => {
    expect(steps('ru')).toEqual([
      'Старт — Главный вход, Кампус',
      'Войдите в здание — Корпус А, этаж 1',
      'Поднимитесь по лестнице — Этаж 2',
      'Финиш — А-201, Корпус А, этаж 2',
    ]);
  });

  it('по-английски — английские действия и переведённые имена', () => {
    // Помещение без перевода показывается исходным именем, а не пропадает.
    expect(steps('en')).toEqual([
      'Start — Main gate, Campus',
      'Enter the building — Building A, floor 1',
      'Take the stairs up — Floor 2',
      'Finish — А-201, Building A, floor 2',
    ]);
  });
});
