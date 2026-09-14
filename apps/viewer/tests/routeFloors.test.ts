import { describe, expect, it } from 'vitest';
import { findPath } from '@campus-map/core';
import { routePassesScope, sameScope } from '../src/utils/routeFloors';
import { fixtureGraph } from './helpers/graphFixture';

/**
 * Области карты и маршрут: проходит ли он через показанный этаж. Этажи маршрута
 * в колонке этажей — `floorScheme.test.ts`.
 */
describe('routePassesScope', () => {
  const graph = fixtureGraph();
  const path = findPath(graph, 'campus_gate', 'a2_room201').path;

  it('маршрут проходит через свои этажи и территорию', () => {
    expect(routePassesScope(graph, path, { mode: 'floor', buildingId: 'building_a', floor: 2 })).toBe(true);
    expect(routePassesScope(graph, path, { mode: 'campus' })).toBe(true);
  });

  it('чужой этаж и пустой путь — не проходит', () => {
    expect(routePassesScope(graph, path, { mode: 'floor', buildingId: 'building_a', floor: 3 })).toBe(false);
    expect(routePassesScope(graph, [], { mode: 'campus' })).toBe(false);
  });
});

describe('sameScope', () => {
  it('сравнивает территорию с территорией и этаж с этажом', () => {
    expect(sameScope({ mode: 'campus' }, { mode: 'campus' })).toBe(true);
    expect(sameScope({ mode: 'floor', buildingId: 'a', floor: 1 }, { mode: 'floor', buildingId: 'a', floor: 1 })).toBe(true);
    expect(sameScope({ mode: 'floor', buildingId: 'a', floor: 1 }, { mode: 'floor', buildingId: 'a', floor: 2 })).toBe(false);
    expect(sameScope({ mode: 'campus' }, { mode: 'floor', buildingId: 'a', floor: 1 })).toBe(false);
  });
});
