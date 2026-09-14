import { beforeEach, describe, expect, it } from 'vitest';
import { AliasManager, DEFAULT_PATHFINDING_OPTIONS, findPath } from '@campus-map/core';
import type { BuildingMeta } from '@campus-map/core';
import { useMapStore } from '../src/stores/mapStore';
import { useRouteStore } from '../src/stores/routeStore';
import { useUiStore } from '../src/stores/uiStore';
import { nearestHint, nearestPlaceOf } from '../src/utils/nearestPlace';
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
    { id: 'campus_gate', names: ['Проходная'], category: 'exit' },
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
    expect(nearestPlaceOf(fixtureGraph(), aliases(), 'campus_gate', 'exit', OPTIONS)).toBeNull();
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
