import { beforeEach, describe, expect, it } from 'vitest';
import { AliasManager, DEFAULT_PATHFINDING_OPTIONS, findPath } from '@campus-map/core';
import type { BuildingMeta } from '@campus-map/core';
import { useMapStore } from '../src/stores/mapStore';
import { useRouteStore } from '../src/stores/routeStore';
import { useUiStore } from '../src/stores/uiStore';
import { nearestHint, nearestPlaceOf, placesOfKind } from '../src/utils/nearestPlace';
import { EXIT_TARGET } from '../src/utils/placeKinds';
import { fixtureGraph } from './helpers/graphFixture';

/**
 * Быстрые кнопки к ближайшему месту (запись 22).
 *
 * Фикстура (`graphFixture`): территория → корпус А, этажи 1 и 2, подняться
 * можно только по лестнице. «Туалеты» — у холла первого этажа и на втором.
 */

const BUILDING_METAS = new Map<string, BuildingMeta>([
  ['building_a', { id: 'building_a', name: 'Корпус А', floors: [{ floor: 1 }, { floor: 2 }] }],
]);

function aliases(): AliasManager {
  const manager = new AliasManager();
  manager.load([
    { id: 'a1_hall', names: ['Туалет у холла'], category: 'toilet' },
    { id: 'a2_room201', names: ['Туалет, 2 этаж'], category: 'toilet' },
    { id: 'campus_gate', names: ['Проходная'] },
  ]);
  return manager;
}

const OPTIONS = { ...DEFAULT_PATHFINDING_OPTIONS };

describe('nearestPlaceOf', () => {
  it('ведёт к месту с самым дешёвым маршрутом, а не к месту на том же этаже', () => {
    const graph = fixtureGraph();

    // Без метрики пролёт лестницы стоит 40, а шаг по этажу — пиксели плана: с
    // лестницы второго этажа холл первого (40 + 70) дешевле помещения в
    // 149 пикселях на том же этаже. Что ближе, решает модель стоимости ядра.
    const [downstairs, sameFloor] = ['a1_hall', 'a2_room201'].map((id) => findPath(graph, 'a2_stairs', id).cost);
    expect(downstairs).toBeLessThan(sameFloor);

    expect(nearestPlaceOf(graph, aliases(), 'a2_stairs', 'toilet', OPTIONS)).toMatchObject({
      nodeId: 'a1_hall',
      reachable: true,
    });
    expect(nearestPlaceOf(graph, aliases(), 'a1_entrance', 'toilet', OPTIONS)?.nodeId).toBe('a1_hall');
  });

  it('само начало не считается', () => {
    expect(nearestPlaceOf(fixtureGraph(), aliases(), 'a1_hall', 'toilet', OPTIONS)?.nodeId).toBe('a2_room201');
  });

  it('без пути при ограничениях находит место без них и отмечает это', () => {
    const place = nearestPlaceOf(fixtureGraph(), aliases(), 'a1_hall', 'toilet', { ...OPTIONS, allowStairs: false });

    expect(place).toMatchObject({ nodeId: 'a2_room201', reachable: false });
  });

  it('без мест категории — null', () => {
    expect(nearestPlaceOf(fixtureGraph(), aliases(), 'a1_hall', 'cloakroom', OPTIONS)).toBeNull();
  });

  it('выход — ближайшая дверь корпуса; с территории выходить некуда', () => {
    expect(nearestPlaceOf(fixtureGraph(), aliases(), 'a2_room201', EXIT_TARGET, OPTIONS)?.nodeId).toBe('a1_entrance');
    expect(nearestPlaceOf(fixtureGraph(), aliases(), 'campus_gate', EXIT_TARGET, OPTIONS)).toBeNull();
  });
});

describe('nearestHint без метрики', () => {
  const hintFrom = (startId: string, language: 'ru' | 'en' = 'ru') => {
    const graph = fixtureGraph();
    const place = nearestPlaceOf(graph, aliases(), startId, 'toilet', OPTIONS);
    if (place === null) throw new Error('место не найдено');
    return nearestHint(graph, BUILDING_METAS, startId, place, language);
  };

  it('на том же этаже', () => {
    expect(hintFrom('a1_entrance')).toBe('этот этаж');
    expect(hintFrom('a1_entrance', 'en')).toBe('this floor');
  });

  it('этаж того же корпуса', () => {
    expect(hintFrom('a1_hall')).toBe('Этаж 2');
    expect(hintFrom('a1_hall', 'en')).toBe('Floor 2');
    expect(hintFrom('a2_stairs')).toBe('Этаж 1');
  });

  it('с территории — корпус и этаж', () => {
    expect(hintFrom('campus_gate')).toBe('Корпус А, этаж 1');
  });
});

describe('маршрут к ближайшему в сторе', () => {
  beforeEach(() => {
    useMapStore.setState({
      graph: fixtureGraph(),
      aliasManager: aliases(),
      campusMeta: { buildings: [{ id: 'building_a', name: 'Корпус А' }], mapSize: { width: 1200, height: 800 } },
      buildingMetas: BUILDING_METAS,
      activeFloor: null,
      selectedNodeId: null,
    });
    useRouteStore.getState().clearRoute();
    useRouteStore.setState({ options: { ...DEFAULT_PATHFINDING_OPTIONS } });
    useUiStore.getState().closeSearch();
  });

  it('без начала маршрута не строит', () => {
    expect(useRouteStore.getState().routeToNearest('toilet')).toBeNull();
    expect(useRouteStore.getState().toNodeId).toBeNull();
  });

  it('от начала строит маршрут к ближайшему месту', () => {
    useRouteStore.getState().setPoint('from', 'campus_gate');
    const route = useRouteStore.getState().routeToNearest('toilet');

    expect(route?.found).toBe(true);
    expect(useRouteStore.getState().toNodeId).toBe('a1_hall');
    expect(useRouteStore.getState().currentRoute).toBe(route);
  });

  it('поиск начала для быстрой кнопки помнит категорию до закрытия', () => {
    useUiStore.getState().openSearch('from', 'toilet');
    expect(useUiStore.getState()).toMatchObject({ searchTarget: 'from', nearestCategory: 'toilet' });

    useUiStore.getState().closeSearch();
    expect(useUiStore.getState().nearestCategory).toBeNull();

    useUiStore.getState().openSearch('place');
    expect(useUiStore.getState().nearestCategory).toBeNull();
  });
});

/**
 * Все места вида после быстрой кнопки (запись 45): маршрут ведёт к
 * ближайшему, а остальные места вида видны списком и на карте.
 */
describe('все места вида после быстрой кнопки', () => {
  beforeEach(() => {
    useMapStore.setState({
      graph: fixtureGraph(),
      aliasManager: aliases(),
      campusMeta: { buildings: [{ id: 'building_a', name: 'Корпус А' }], mapSize: { width: 1200, height: 800 } },
      buildingMetas: BUILDING_METAS,
      activeFloor: null,
      selectedNodeId: null,
    });
    useRouteStore.getState().clearRoute();
    useRouteStore.setState({ options: { ...DEFAULT_PATHFINDING_OPTIONS } });
  });

  const route = () => useRouteStore.getState();

  it('места вида — ближайшее первым, без самого начала', () => {
    const places = placesOfKind(fixtureGraph(), aliases(), 'a2_stairs', 'toilet', OPTIONS);
    expect(places.map((place) => place.nodeId)).toEqual(['a1_hall', 'a2_room201']);
    expect(placesOfKind(fixtureGraph(), aliases(), 'a1_hall', 'toilet', OPTIONS).map((place) => place.nodeId)).toEqual([
      'a2_room201',
    ]);
  });

  it('порядок — по близости, а не по порядку записей в данных', () => {
    // Туалет второго этажа записан первым, но с лестницы второго этажа холл
    // первого ближе (см. «ведёт к месту с самым дешёвым маршрутом»).
    const reversed = new AliasManager();
    reversed.load([
      { id: 'a2_room201', names: ['Туалет, 2 этаж'], category: 'toilet' },
      { id: 'a1_hall', names: ['Туалет у холла'], category: 'toilet' },
    ]);

    expect(placesOfKind(fixtureGraph(), reversed, 'a2_stairs', 'toilet', OPTIONS).map((place) => place.nodeId)).toEqual([
      'a1_hall',
      'a2_room201',
    ]);
  });

  it('места, до которых при ограничениях не дойти, не показываются', () => {
    expect(placesOfKind(fixtureGraph(), aliases(), 'a1_hall', 'toilet', { ...OPTIONS, allowStairs: false })).toEqual([]);
  });

  it('выходы — двери корпусов', () => {
    expect(placesOfKind(fixtureGraph(), aliases(), 'a2_room201', EXIT_TARGET, OPTIONS).map((place) => place.nodeId)).toEqual([
      'a1_entrance',
    ]);
  });

  it('быстрая кнопка запоминает вид; другое место того же вида — выбор продолжается', () => {
    route().setPoint('from', 'campus_gate');
    route().routeToNearest('toilet');
    expect(route()).toMatchObject({ toNodeId: 'a1_hall', nearestKind: 'toilet' });

    route().setPoint('to', 'a2_room201');
    expect(route()).toMatchObject({ toNodeId: 'a2_room201', nearestKind: 'toilet' });
    expect(route().currentRoute?.found).toBe(true);
  });

  it('цель другого вида, сброс и обмен точек заканчивают выбор', () => {
    route().setPoint('from', 'campus_gate');
    route().routeToNearest('toilet');
    route().setPoint('to', 'a1_entrance');
    expect(route().nearestKind).toBeNull();

    route().routeToNearest('toilet');
    route().clearRoute();
    expect(route().nearestKind).toBeNull();

    route().setPoint('from', 'campus_gate');
    route().routeToNearest('toilet');
    route().swapPoints();
    expect(route().nearestKind).toBeNull();
  });
});
