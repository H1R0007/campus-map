import { describe, expect, it } from 'vitest';
import { findPath } from '@campus-map/core';
import { routeFloorScheme } from '../src/utils/floorScheme';
import { fixtureGraph } from './helpers/graphFixture';

/**
 * Схема маршрута в колонке этажей.
 *
 * Фикстура (`graphFixture`): территория → корпус А, этажи 1 и 2, подняться
 * можно только по лестнице.
 */

function schemeOf(from: string, to: string, buildingId = 'building_a') {
  const graph = fixtureGraph();
  const scheme = routeFloorScheme(graph, findPath(graph, from, to), buildingId);
  return { floors: Object.fromEntries(scheme.floors), links: scheme.links };
}

describe('routeFloorScheme', () => {
  it('начало и цель в корпусе, лестница между этажами', () => {
    expect(schemeOf('a1_hall', 'a2_room201')).toEqual({
      floors: { 1: 'start', 2: 'end' },
      links: [{ upper: 2, lower: 1, type: 'stairs' }],
    });
  });

  it('маршрут с территории: первый этаж корпуса — по пути', () => {
    expect(schemeOf('campus_gate', 'a2_room201').floors).toEqual({ 1: 'pass', 2: 'end' });
  });

  it('спуск — тот же переход: верхний и нижний этаж, а не откуда и куда', () => {
    expect(schemeOf('a2_room201', 'a1_hall')).toEqual({
      floors: { 2: 'start', 1: 'end' },
      links: [{ upper: 2, lower: 1, type: 'stairs' }],
    });
  });

  it('маршрут по одному этажу: начало и цель на нём, переходов нет', () => {
    expect(schemeOf('a1_entrance', 'a1_hall')).toEqual({ floors: { 1: 'both' }, links: [] });
  });

  it('в другом корпусе схемы нет', () => {
    expect(schemeOf('a1_hall', 'a2_room201', 'building_b')).toEqual({ floors: {}, links: [] });
  });

  it('у ненайденного маршрута схемы нет', () => {
    const graph = fixtureGraph();
    const route = findPath(graph, 'a1_hall', 'a2_room201', { allowStairs: false });

    expect(route.found).toBe(false);
    expect(routeFloorScheme(graph, route, 'building_a').floors.size).toBe(0);
  });
});
