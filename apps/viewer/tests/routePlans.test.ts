import { describe, expect, it } from 'vitest';
import { campusMapUrl, findPath, floorMapUrl } from '@campus-map/core';
import { routePlanUrls } from '../src/utils/routePlans';
import { fixtureGraph } from './helpers/graphFixture';

/**
 * Планы маршрута, которые загружаются заранее (запись 26).
 *
 * Фикстура (`graphFixture`): территория → корпус А, этажи 1 и 2.
 */
describe('routePlanUrls', () => {
  it('территория и этажи маршрута — в порядке прохождения, без повторов', () => {
    const graph = fixtureGraph();
    const path = findPath(graph, 'campus_gate', 'a2_room201').path;

    expect(routePlanUrls(graph, path, '/data')).toEqual([
      campusMapUrl('/data'),
      floorMapUrl('building_a', 1, '/data'),
      floorMapUrl('building_a', 2, '/data'),
    ]);
  });

  it('маршрут по одному этажу — один план', () => {
    const graph = fixtureGraph();

    expect(routePlanUrls(graph, ['a1_entrance', 'a1_hall', 'a1_stairs'], '/data')).toEqual([
      floorMapUrl('building_a', 1, '/data'),
    ]);
  });

  it('узлы, которых нет в графе, пропускаются', () => {
    expect(routePlanUrls(fixtureGraph(), ['nope'], '/data')).toEqual([]);
  });
});
