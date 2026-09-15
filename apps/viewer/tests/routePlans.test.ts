import { describe, expect, it } from 'vitest';
import { findPath } from '@campus-map/core';
import type { BuildingMeta, CampusMeta } from '@campus-map/core';
import { routePlanUrls } from '../src/utils/routePlans';
import { fixtureGraph } from './helpers/graphFixture';

/**
 * Планы маршрута, которые загружаются заранее (запись 26), в формате из данных
 * (запись 29).
 *
 * Фикстура (`graphFixture`): территория → корпус А, этажи 1 и 2.
 */

const CAMPUS: CampusMeta = { buildings: [{ id: 'building_a' }], mapSize: { width: 10, height: 10 }, planFormat: 'svg' };
const METAS = new Map<string, BuildingMeta>([
  ['building_a', { id: 'building_a', name: 'Корпус А', floors: [{ floor: 1 }, { floor: 2, planFormat: 'svg' }] }],
]);

describe('routePlanUrls', () => {
  it('территория и этажи маршрута — в порядке прохождения, без повторов, в своём формате', () => {
    const graph = fixtureGraph();
    const path = findPath(graph, 'campus_gate', 'a2_room201').path;

    expect(routePlanUrls(graph, path, CAMPUS, METAS, '/data')).toEqual([
      '/data/campus/map.svg',
      '/data/buildings/building_a/floors/1/map.png',
      '/data/buildings/building_a/floors/2/map.svg',
    ]);
  });

  it('маршрут по одному этажу — один план', () => {
    expect(routePlanUrls(fixtureGraph(), ['a1_entrance', 'a1_hall', 'a1_stairs'], CAMPUS, METAS, '/data')).toEqual([
      '/data/buildings/building_a/floors/1/map.png',
    ]);
  });

  it('узлы, которых нет в графе, пропускаются', () => {
    expect(routePlanUrls(fixtureGraph(), ['nope'], CAMPUS, METAS, '/data')).toEqual([]);
  });
});
