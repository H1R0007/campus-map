import { describe, expect, it } from 'vitest';
import { findPath } from '@campus-map/core';
import { routeFloorsIn } from '../src/utils/routeFloors';
import { fixtureGraph } from './helpers/graphFixture';

/**
 * Отметки этажей маршрута на панели этажей.
 */
describe('routeFloorsIn', () => {
  const graph = fixtureGraph();
  const path = findPath(graph, 'campus_gate', 'a2_room201').path;

  it('перечисляет этажи корпуса, через которые идёт маршрут', () => {
    expect([...routeFloorsIn(graph, path, 'building_a')].sort()).toEqual([1, 2]);
  });

  it('узлы территории и других корпусов этажами не считаются', () => {
    // Маршрут начинается на территории (этаж 0 в данных), но у корпуса Б
    // этажа 0 на этом маршруте нет.
    expect(routeFloorsIn(graph, path, 'building_b').size).toBe(0);
    expect(routeFloorsIn(graph, path, 'building_a').has(0)).toBe(false);
  });

  it('без маршрута — ни одного этажа', () => {
    expect(routeFloorsIn(graph, [], 'building_a').size).toBe(0);
  });
});
