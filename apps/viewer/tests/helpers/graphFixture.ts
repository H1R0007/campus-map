import { Graph } from '@campus-map/core';
import type { MapNode, Transition } from '@campus-map/core';

/**
 * Маленький синтетический граф для тестов навигатора.
 *
 * Продуктовый `data/` здесь намеренно не используется: тесты приложения не
 * должны ломаться от правки датасета, ради которой существует редактор.
 * Проверяется поведение кода, а не содержимое данных.
 *
 * Раскладка: территория кампуса → корпус A (этажи 1 и 2).
 *
 *   campus_gate ── campus_entrance_a ══ a1_entrance ── a1_hall ── a1_stairs
 *                                                                    ║
 *                                                                 a2_stairs ── a2_room201
 *
 * `──` — обычное ребро, `══` — переход.
 */

export function node(
  id: string,
  building: string,
  floor: number,
  x: number,
  y: number,
  neighbors: string[],
  isPortal = false
): MapNode {
  return { id, building, floor, x, y, neighbors, isPortal };
}

export const FIXTURE_NODES: MapNode[] = [
  node('campus_gate', 'CAMPUS', 0, 600, 750, ['campus_entrance_a']),
  node('campus_entrance_a', 'CAMPUS', 0, 200, 300, ['campus_gate'], true),

  node('a1_entrance', 'building_a', 1, 200, 350, ['a1_hall'], true),
  node('a1_hall', 'building_a', 1, 200, 300, ['a1_entrance', 'a1_stairs']),
  node('a1_stairs', 'building_a', 1, 270, 300, ['a1_hall'], true),

  node('a2_stairs', 'building_a', 2, 270, 300, ['a2_room201'], true),
  node('a2_room201', 'building_a', 2, 130, 250, ['a2_stairs']),
];

export const FIXTURE_TRANSITIONS: Transition[] = [
  { fromNode: 'campus_entrance_a', toNode: 'a1_entrance', type: 'entrance' },
  { fromNode: 'a1_stairs', toNode: 'a2_stairs', type: 'stairs' },
];

export function fixtureGraph(): Graph {
  return new Graph(FIXTURE_NODES, FIXTURE_TRANSITIONS);
}
