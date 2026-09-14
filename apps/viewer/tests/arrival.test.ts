import { beforeEach, describe, expect, it } from 'vitest';
import { AliasManager, DEFAULT_PATHFINDING_OPTIONS } from '@campus-map/core';
import type { BuildingMeta } from '@campus-map/core';
import { useMapStore } from '../src/stores/mapStore';
import { useRouteStore } from '../src/stores/routeStore';
import { sheetModeOf } from '../src/stores/uiStore';
import { fixtureGraph } from './helpers/graphFixture';

/**
 * Прибытие после последнего шага: «Обратно» и «К выходу» (запись 24).
 *
 * Фикстура (`graphFixture`): территория → корпус А, этажи 1 и 2. Выходы —
 * проходная и вход в корпус.
 */

const route = () => useRouteStore.getState();

beforeEach(() => {
  const aliasManager = new AliasManager();
  aliasManager.load([
    { id: 'campus_gate', names: ['Проходная'], category: 'exit' },
    { id: 'a1_entrance', names: ['Вход в корпус А'], category: 'exit' },
    { id: 'a2_room201', names: ['А-201'] },
  ]);

  useMapStore.setState({
    graph: fixtureGraph(),
    aliasManager,
    campusMeta: { buildings: [{ id: 'building_a', name: 'Корпус А' }], mapSize: { width: 1200, height: 800 } },
    buildingMetas: new Map<string, BuildingMeta>([
      ['building_a', { id: 'building_a', name: 'Корпус А', floors: [{ floor: 1 }, { floor: 2 }] }],
    ]),
    activeFloor: null,
    selectedNodeId: null,
  });
  route().clearRoute();
  useRouteStore.setState({ options: { ...DEFAULT_PATHFINDING_OPTIONS } });
});

/** От проходной до А-201, первый шаг и «Готово». */
function arrive(): void {
  route().setPoint('from', 'campus_gate');
  route().setPoint('to', 'a2_room201');
  route().setStep(0);
  route().finish();
}

describe('прибытие', () => {
  it('«Готово» — прибытие, а не обзор', () => {
    arrive();

    expect(route()).toMatchObject({ stepIndex: null, arrived: true });
    expect(
      sheetModeOf({ selectedNodeId: null, currentRoute: route().currentRoute, stepIndex: null, arrived: true })
    ).toBe('arrived');
  });

  it('без найденного маршрута прибытия нет', () => {
    route().finish();

    expect(route().arrived).toBe(false);
  });

  it('«Обратно» строит маршрут в обратную сторону и возвращает к обзору', () => {
    arrive();
    route().swapPoints();

    expect(route()).toMatchObject({ fromNodeId: 'a2_room201', toNodeId: 'campus_gate', arrived: false });
    expect(route().currentRoute?.found).toBe(true);
  });

  it('«К выходу» ведёт от цели к ближайшему выходу', () => {
    arrive();
    const result = route().continueToNearest('exit');

    expect(result?.found).toBe(true);
    expect(route()).toMatchObject({ fromNodeId: 'a2_room201', toNodeId: 'a1_entrance', arrived: false });
  });

  it('новый шаг и сброс маршрута снимают прибытие', () => {
    arrive();
    route().setStep(1);
    expect(route().arrived).toBe(false);

    arrive();
    route().clearRoute();
    expect(route().arrived).toBe(false);
  });
});
