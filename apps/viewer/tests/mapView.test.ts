import { describe, expect, it } from 'vitest';
import { scopeOfFloor } from '@campus-map/core';
import { isScopeShown, shownNodesOf } from '../src/utils/mapView';
import type { MapView } from '../src/utils/mapView';
import { routeBuildingFloors } from '../src/utils/routeFloors';
import { fixtureGraph } from './helpers/graphFixture';

/**
 * Что видно на карте навигатора: на одном плане и на холсте кампуса (запись 32).
 */

const graph = fixtureGraph();

const canvas = (revealed: string[], floor: number): MapView => ({
  kind: 'canvas',
  floors: new Map([['building_a', floor]]),
  revealed: new Set(revealed),
});

describe('что видно на карте', () => {
  it('на карте одного плана — только его область', () => {
    const view: MapView = { kind: 'plan', scope: scopeOfFloor('building_a', 1) };

    expect(isScopeShown(view, scopeOfFloor('building_a', 1))).toBe(true);
    expect(isScopeShown(view, scopeOfFloor('building_a', 2))).toBe(false);
    expect(isScopeShown(view, { mode: 'campus' })).toBe(false);
  });

  it('на холсте территория видна всегда, этаж — если корпус приближен и этаж в нём открыт', () => {
    expect(isScopeShown(canvas([], 1), { mode: 'campus' })).toBe(true);
    expect(isScopeShown(canvas([], 1), scopeOfFloor('building_a', 1))).toBe(false);
    expect(isScopeShown(canvas(['building_a'], 1), scopeOfFloor('building_a', 1))).toBe(true);
    expect(isScopeShown(canvas(['building_a'], 1), scopeOfFloor('building_a', 2))).toBe(false);
  });

  it('узлы холста — территория и открытые этажи приближенных корпусов', () => {
    const ids = (view: MapView) => shownNodesOf(graph, view).map((node) => node.id).sort();

    expect(ids(canvas([], 2))).toEqual(['campus_entrance_a', 'campus_gate']);
    expect(ids(canvas(['building_a'], 2))).toEqual(['a2_room201', 'a2_stairs', 'campus_entrance_a', 'campus_gate']);
  });
});

describe('routeBuildingFloors', () => {
  it('в каждом корпусе — этаж, где маршрут в нём заканчивается или из него выходит', () => {
    const inward = ['campus_gate', 'campus_entrance_a', 'a1_entrance', 'a1_hall', 'a1_stairs', 'a2_stairs', 'a2_room201'];

    expect(routeBuildingFloors(graph, inward)).toEqual({ building_a: 2 });
    expect(routeBuildingFloors(graph, [...inward].reverse())).toEqual({ building_a: 1 });
    expect(routeBuildingFloors(graph, ['campus_gate', 'campus_entrance_a'])).toEqual({});
  });
});
