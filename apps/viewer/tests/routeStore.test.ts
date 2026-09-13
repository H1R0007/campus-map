import { beforeEach, describe, expect, it } from 'vitest';
import { AliasManager } from '@campus-map/core';
import { useMapStore } from '../src/stores/mapStore';
import { useRouteStore } from '../src/stores/routeStore';
import { fixtureGraph } from './helpers/graphFixture';

/**
 * Поведение стора маршрута.
 *
 * Главное, что здесь проверяется, — построенный маршрут действительно
 * показывается. Навигатор стартует в виде кампуса, где слой маршрута рисует
 * только узлы территории, поэтому маршрут между аудиториями отфильтровывался
 * целиком: пользователь видел неизменную карту и подпись «Маршрут готов».
 */

const ALIASES = [
  { id: 'a2_room201', names: ['А-201', '201'] },
  { id: 'campus_gate', names: ['Главный вход'] },
  { id: 'a1_hall', names: ['Холл А'] },
];

function loadFixture(): void {
  const aliasManager = new AliasManager();
  aliasManager.load(ALIASES);

  useMapStore.setState({
    graph: fixtureGraph(),
    aliasManager,
    campusMeta: { buildings: [{ id: 'building_a', name: 'Корпус А' }], mapSize: { width: 1200, height: 800 } },
    buildingMetas: new Map([
      [
        'building_a',
        {
          id: 'building_a',
          name: 'Корпус А',
          floors: [{ floor: 1 }, { floor: 2 }],
        },
      ],
    ]),
    activeFloor: null,
  });

  useRouteStore.getState().clearRoute();
}

beforeEach(loadFixture);

describe('построение маршрута', () => {
  it('переводит карту на этаж, где маршрут начинается', () => {
    const route = useRouteStore.getState();

    route.setQuery('from', 'Холл А');
    route.setQuery('to', 'А-201');
    route.buildRoute();

    expect(useRouteStore.getState().currentRoute?.found).toBe(true);

    // Стартовый узел — на первом этаже корпуса А, значит карта обязана
    // показывать именно его, а не территорию кампуса.
    expect(useMapStore.getState().activeFloor).toEqual({ buildingId: 'building_a', floor: 1 });
  });

  it('возвращает карту на территорию, если маршрут начинается на улице', () => {
    useMapStore.getState().setActiveFloor('building_a', 2);

    const route = useRouteStore.getState();
    route.setQuery('from', 'Главный вход');
    route.setQuery('to', 'А-201');
    route.buildRoute();

    expect(useRouteStore.getState().currentRoute?.found).toBe(true);
    expect(useMapStore.getState().activeFloor).toBeNull();
  });

  it('не трогает вид, если маршрут не найден', () => {
    useMapStore.getState().setActiveFloor('building_a', 2);

    const route = useRouteStore.getState();
    route.setQuery('from', 'Холл А');
    route.setQuery('to', 'нет такого места');
    route.buildRoute();

    expect(useRouteStore.getState().currentRoute).toBeNull();
    expect(useMapStore.getState().activeFloor).toEqual({ buildingId: 'building_a', floor: 2 });
  });
});

describe('устаревание маршрута', () => {
  it('снимает маршрут, когда точка назначения изменилась', () => {
    const route = useRouteStore.getState();

    route.setQuery('from', 'Холл А');
    route.setQuery('to', 'А-201');
    route.buildRoute();
    expect(useRouteStore.getState().currentRoute?.found).toBe(true);

    // Пользователь начал править поле «Куда»: показывать старую линию рядом с
    // новым текстом нельзя — карточка врала бы о том, что нарисовано.
    useRouteStore.getState().setQuery('to', 'А-2');
    expect(useRouteStore.getState().currentRoute).toBeNull();
  });

  it('сохраняет маршрут, пока точки те же', () => {
    const route = useRouteStore.getState();

    route.setQuery('from', 'Холл А');
    route.setQuery('to', 'А-201');
    route.buildRoute();

    // Другой алиас того же узла — маршрут остаётся верным.
    useRouteStore.getState().setQuery('to', '201');
    expect(useRouteStore.getState().currentRoute?.found).toBe(true);
  });
});

describe('ограничения маршрута', () => {
  it('не строит маршрут по своей инициативе при смене ограничений', () => {
    const route = useRouteStore.getState();

    route.setQuery('from', 'Холл А');
    route.setQuery('to', 'А-201');
    // «Построить» не нажимали.

    route.setOptions({ preferLift: true });

    expect(useRouteStore.getState().currentRoute).toBeNull();
  });

  it('пересчитывает уже показанный маршрут', () => {
    const route = useRouteStore.getState();

    route.setQuery('from', 'Холл А');
    route.setQuery('to', 'А-201');
    route.buildRoute();

    // Единственный путь наверх — лестница. Запрет делает цель недостижимой,
    // и об этом нужно сообщить сразу, а не оставлять прежний результат.
    useRouteStore.getState().setOptions({ allowStairs: false });

    expect(useRouteStore.getState().currentRoute?.found).toBe(false);
  });
});
