import { beforeEach, describe, expect, it } from 'vitest';
import { AliasManager, DEFAULT_PATHFINDING_OPTIONS } from '@campus-map/core';
import { useMapStore } from '../src/stores/mapStore';
import { useRouteStore } from '../src/stores/routeStore';
import { fixtureGraph } from './helpers/graphFixture';

/**
 * Холст кампуса в сторе карты: этаж каждого корпуса, текущий корпус от камеры
 * и просьбы к камере (запись 32).
 */

beforeEach(() => {
  useMapStore.setState({
    graph: fixtureGraph(),
    aliasManager: new AliasManager(),
    campusMeta: { buildings: [{ id: 'building_a', name: 'Корпус А' }], mapSize: { width: 1200, height: 800 } },
    buildingMetas: new Map([['building_a', { id: 'building_a', name: 'Корпус А', floors: [{ floor: 1 }, { floor: 2 }] }]]),
    activeFloor: null,
    buildingFloors: {},
    revealedBuildings: [],
    viewRequest: null,
    selectedNodeId: null,
  });
  useRouteStore.getState().clearRoute();
  useRouteStore.setState({ options: { ...DEFAULT_PATHFINDING_OPTIONS } });
});

const map = () => useMapStore.getState();

describe('холст кампуса: этажи корпусов и камера', () => {
  it('выбор корпуса ведёт камеру к нему, смена этажа того же корпуса — нет', () => {
    map().setActiveFloor('building_a', 1);
    expect(map().viewRequest?.target).toEqual({ kind: 'building', buildingId: 'building_a' });

    const seq = map().viewRequest?.seq;
    map().setActiveFloor('building_a', 2);

    expect(map().viewRequest?.seq).toBe(seq);
    expect(map().buildingFloors).toEqual({ building_a: 2 });
  });

  it('показ места просит камеру к самому месту, а не ко всему корпусу', () => {
    map().showNode('a2_room201');

    expect(map().viewRequest?.target).toEqual({ kind: 'node', nodeId: 'a2_room201' });
    expect(map().activeFloor).toEqual({ buildingId: 'building_a', floor: 2 });
  });

  it('камера делает корпус текущим с открытым в нём этажом, не ведёт камеру и не снимает выбор', () => {
    map().setActiveFloor('building_a', 2);
    map().clearActiveFloor();
    map().selectNode('campus_gate');
    const seq = map().viewRequest?.seq;

    map().focusFromCamera('building_a');
    expect(map().activeFloor).toEqual({ buildingId: 'building_a', floor: 2 });
    expect(map().selectedNodeId).toBe('campus_gate');
    expect(map().viewRequest?.seq).toBe(seq);

    map().focusFromCamera(null);
    expect(map().activeFloor).toBeNull();
  });

  it('новый маршрут открывает в корпусе этаж цели, а камеру ведёт к началу', () => {
    useRouteStore.getState().setPoint('from', 'campus_gate');
    useRouteStore.getState().setPoint('to', 'a2_room201');

    expect(map().buildingFloors).toEqual({ building_a: 2 });
    expect(map().activeFloor).toBeNull();
    expect(map().viewRequest?.target).toEqual({ kind: 'node', nodeId: 'campus_gate' });
  });

  it('начало в том же корпусе: открыт этаж начала, и запись этажа с ним совпадает', () => {
    map().setActiveFloor('building_a', 1);
    useRouteStore.getState().setPoint('from', 'a1_hall');
    useRouteStore.getState().setPoint('to', 'a2_room201');

    expect(map().activeFloor).toEqual({ buildingId: 'building_a', floor: 1 });
    expect(map().buildingFloors).toEqual({ building_a: 1 });
  });

  it('тот же набор приближенных корпусов не создаёт нового состояния', () => {
    map().setRevealedBuildings(['building_a']);
    const first = map().revealedBuildings;
    map().setRevealedBuildings(['building_a']);

    expect(map().revealedBuildings).toBe(first);
  });
});
