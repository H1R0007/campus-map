import { beforeEach, describe, expect, it } from 'vitest';
import { AliasManager, DEFAULT_PATHFINDING_OPTIONS } from '@campus-map/core';
import { useMapStore } from '../src/stores/mapStore';
import { useRouteStore } from '../src/stores/routeStore';
import { fixtureGraph } from './helpers/graphFixture';

/**
 * Поведение стора маршрута.
 *
 * Фикстура (`graphFixture`): территория → корпус А, этажи 1 и 2, подняться
 * можно только по лестнице. Главное, что проверяется, — построенный маршрут
 * действительно показывается: навигатор стартует в виде кампуса, где слой
 * маршрута рисует только узлы территории.
 */

function loadFixture(): void {
  const aliasManager = new AliasManager();
  aliasManager.load([
    { id: 'a2_room201', names: ['А-201'] },
    { id: 'campus_gate', names: ['Главный вход'] },
    { id: 'a1_hall', names: ['Холл А'] },
  ]);

  useMapStore.setState({
    graph: fixtureGraph(),
    aliasManager,
    campusMeta: { buildings: [{ id: 'building_a', name: 'Корпус А' }], mapSize: { width: 1200, height: 800 } },
    buildingMetas: new Map([['building_a', { id: 'building_a', name: 'Корпус А', floors: [{ floor: 1 }, { floor: 2 }] }]]),
    activeFloor: null,
    selectedNodeId: null,
  });

  useRouteStore.getState().clearRoute();
  // Ограничения тоже сбрасываются: `clearRoute` их не трогает, и запрет
  // лестниц из одного теста делал недостижимым второй этаж во всех следующих.
  useRouteStore.setState({ options: { ...DEFAULT_PATHFINDING_OPTIONS } });
}

beforeEach(loadFixture);

const route = () => useRouteStore.getState();
const activeFloor = () => useMapStore.getState().activeFloor;

describe('точка маршрута узлом', () => {
  it('первая точка маршрут не строит, вторая — строит и открывает этаж начала', () => {
    expect(route().setPoint('to', 'a2_room201')).toBeNull();
    expect(route().currentRoute).toBeNull();

    const built = route().setPoint('from', 'a1_hall');

    expect(built?.found).toBe(true);
    expect(route().currentRoute).toBe(built);
    expect(activeFloor()).toEqual({ buildingId: 'building_a', floor: 1 });
  });

  it('маршрут от ворот возвращает карту на территорию', () => {
    useMapStore.getState().setActiveFloor('building_a', 2);

    route().setPoint('from', 'campus_gate');
    route().setPoint('to', 'a2_room201');

    expect(route().currentRoute?.found).toBe(true);
    expect(activeFloor()).toBeNull();
  });

  it('новая точка перестраивает маршрут', () => {
    route().setPoint('from', 'a1_hall');
    const first = route().setPoint('to', 'a2_room201');
    const second = route().setPoint('to', 'campus_gate');

    expect(second).not.toBe(first);
    expect(second?.path[second.path.length - 1]).toBe('campus_gate');
  });

  it('повторный выбор той же точки не перестраивает показанный маршрут', () => {
    route().setPoint('from', 'a1_hall');
    const first = route().setPoint('to', 'a2_room201');

    expect(route().setPoint('to', 'a2_room201')).toBe(first);
  });

  it('снятие точки снимает маршрут, вторая точка остаётся', () => {
    route().setPoint('from', 'a1_hall');
    route().setPoint('to', 'a2_room201');

    route().clearPoint('from');

    expect(route().currentRoute).toBeNull();
    expect(route().fromNodeId).toBeNull();
    expect(route().toNodeId).toBe('a2_room201');
  });

  it('не найденный маршрут вид не меняет', () => {
    useMapStore.getState().setActiveFloor('building_a', 2);
    route().setOptions({ allowStairs: false });

    route().setPoint('from', 'a1_hall');
    const result = route().setPoint('to', 'a2_room201');

    expect(result?.found).toBe(false);
    expect(activeFloor()).toEqual({ buildingId: 'building_a', floor: 2 });
  });
});

describe('ограничения маршрута', () => {
  it('не строят маршрут по своей инициативе', () => {
    route().setPoint('from', 'a1_hall');
    route().setOptions({ preferLift: true });

    expect(route().currentRoute).toBeNull();
  });

  it('пересчитывают уже показанный маршрут', () => {
    route().setPoint('from', 'a1_hall');
    route().setPoint('to', 'a2_room201');

    // Единственный путь наверх — лестница. Запрет делает цель недостижимой,
    // и об этом нужно сообщить сразу, а не оставлять прежний результат.
    route().setOptions({ allowStairs: false });

    expect(route().currentRoute?.found).toBe(false);
  });

  it('не уводят карту с открытого этажа, через который идёт пересчитанный маршрут', () => {
    route().setPoint('from', 'a1_hall');
    route().setPoint('to', 'a2_room201');
    // Человек рассматривает второй этаж маршрута, а карта открылась на первом.
    useMapStore.getState().setActiveFloor('building_a', 2);

    route().setOptions({ preferLift: true });

    expect(route().currentRoute?.found).toBe(true);
    expect(activeFloor()).toEqual({ buildingId: 'building_a', floor: 2 });
  });

  it('ведут к началу, если пересчитанный маршрут через открытый вид не проходит', () => {
    route().setPoint('from', 'a1_hall');
    route().setPoint('to', 'campus_gate');
    useMapStore.getState().setActiveFloor('building_a', 2);

    route().setOptions({ preferLift: true });

    expect(route().currentRoute?.found).toBe(true);
    expect(activeFloor()).toEqual({ buildingId: 'building_a', floor: 1 });
  });
});

describe('обмен точек', () => {
  it('пересчитывает показанный маршрут в обратную сторону', () => {
    route().setPoint('from', 'a1_hall');
    route().setPoint('to', 'a2_room201');

    route().swapPoints();

    expect(route().currentRoute?.path[0]).toBe('a2_room201');
    expect(activeFloor()).toEqual({ buildingId: 'building_a', floor: 2 });
  });

  it('без маршрута только меняет точки местами', () => {
    route().setPoint('from', 'a1_hall');

    route().swapPoints();

    expect(route().fromNodeId).toBeNull();
    expect(route().toNodeId).toBe('a1_hall');
    expect(route().currentRoute).toBeNull();
  });
});

describe('шаг навигации', () => {
  it('принадлежит маршруту: пересчёт, обмен и снятие точки возвращают к обзору', () => {
    route().setPoint('from', 'a1_hall');
    route().setPoint('to', 'a2_room201');

    route().setStep(2);
    expect(route().stepIndex).toBe(2);

    route().setOptions({ preferLift: true });
    expect(route().stepIndex).toBeNull();

    route().setStep(1);
    route().swapPoints();
    expect(route().stepIndex).toBeNull();

    route().setStep(1);
    route().clearPoint('to');
    expect(route().stepIndex).toBeNull();
  });

  it('без найденного маршрута шага нет', () => {
    route().setPoint('from', 'a1_hall');
    route().setStep(0);
    expect(route().stepIndex).toBeNull();

    route().setOptions({ allowStairs: false });
    route().setPoint('to', 'a2_room201');
    route().setStep(0);
    expect(route().stepIndex).toBeNull();
  });
});
