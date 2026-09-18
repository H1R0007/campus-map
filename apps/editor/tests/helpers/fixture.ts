import type { Dataset, MapNode } from '@campus-map/core';
import { useEditorStore } from '../../src/stores/editorStore';
import { useHistoryStore } from '../../src/stores/historyStore';

/**
 * Маленький синтетический кампус для тестов редактора.
 *
 * Продуктовый `data/` здесь не используется намеренно: тесты кода не должны
 * ломаться от разметки, ради которой редактор существует (запись 10).
 *
 *   территория:  campus_gate ── campus_entrance_a*
 *                                     ║ entrance
 *   корпус А, 1: a1_entrance* ── a1_hall ── a1_stairs*
 *                                   │           ║ stairs
 *                               a1_room101      ║
 *   корпус А, 2:               a2_stairs* ── a2_corridor ── a2_room201
 *
 * `*` — узел перехода (`isPortal`), `══` — переход между планами.
 */

function node(id: string, building: string, floor: number, x: number, y: number, neighbors: string[], isPortal = false): MapNode {
  return { id, building, floor, x, y, neighbors, isPortal };
}

export function fixtureDataset(): Dataset {
  return {
    campusMeta: {
      buildings: [{ id: 'building_a', name: 'Корпус А' }],
      mapSize: { width: 800, height: 600 },
      metersPerPixel: 0.5,
      planFormat: 'svg',
    },
    buildingMetas: [
      {
        id: 'building_a',
        name: 'Корпус А',
        entranceFloor: 1,
        translations: { en: { name: 'Building A' } },
        placement: {
          metersPerPixel: 0.1,
          originMeters: { x: 30, y: 40 },
          rotationDeg: 0,
          baseElevationMeters: 0,
          floorHeightMeters: 3.6,
        },
        floors: [
          { floor: 1, mapSize: { width: 400, height: 200 }, planFormat: 'svg' },
          { floor: 2, mapSize: { width: 400, height: 200 }, planFormat: 'svg' },
        ],
      },
    ],
    nodes: [
      node('campus_gate', 'CAMPUS', 0, 100, 500, ['campus_entrance_a']),
      node('campus_entrance_a', 'CAMPUS', 0, 100, 300, ['campus_gate'], true),
      node('a1_entrance', 'building_a', 1, 40, 180, ['a1_hall'], true),
      node('a1_hall', 'building_a', 1, 100, 120, ['a1_entrance', 'a1_stairs', 'a1_room101']),
      node('a1_stairs', 'building_a', 1, 300, 120, ['a1_hall'], true),
      { ...node('a1_room101', 'building_a', 1, 100, 60, ['a1_hall']), comment: 'уточнить у коменданта' },
      node('a2_stairs', 'building_a', 2, 300, 120, ['a2_corridor'], true),
      node('a2_corridor', 'building_a', 2, 200, 120, ['a2_stairs', 'a2_room201']),
      node('a2_room201', 'building_a', 2, 200, 60, ['a2_corridor']),
    ],
    transitions: [
      { fromNode: 'campus_entrance_a', toNode: 'a1_entrance', type: 'entrance' },
      { fromNode: 'a1_stairs', toNode: 'a2_stairs', type: 'stairs' },
    ],
    placeKinds: [],
    aliases: [
      { id: 'campus_gate', names: ['Главный вход'], category: 'exit' },
      { id: 'a1_room101', names: ['А-101', '101'], translations: { en: { names: ['A-101'] } } },
      { id: 'a2_room201', names: ['А-201'] },
    ],
  };
}

/** Состояние стора сразу после создания — со всеми действиями. */
const pristine = useEditorStore.getState();

/**
 * Свежий стор с загруженной фикстурой.
 *
 * Стор — модульный синглтон, поэтому между тестами он возвращается к
 * исходному состоянию целиком: выделение, инструмент или буфер обмена одного
 * теста не должны влиять на следующий.
 */
export function loadFixture(dataset: Dataset = fixtureDataset()): void {
  useEditorStore.setState(pristine, true);
  useHistoryStore.getState().clear();
  useEditorStore.getState().loadData(dataset);
}

/** Открыть этаж корпуса А (или территорию, если `floor === null`). */
export function openFloor(floor: number | null): void {
  useEditorStore.setState({
    currentBuilding: floor === null ? null : 'building_a',
    currentFloor: floor,
  });
}

export const store = () => useEditorStore.getState();

/**
 * Данные, которые правит редактор, в сравнимом виде: узлы, переходы, названия
 * с их видами мест и переводами. Порядок соседей сохраняется — от него
 * зависит содержимое `graph.json`. Поле, которого здесь нет, круг «сделать →
 * отменить → повторить» не проверяет, поэтому список идёт следом за данными.
 */
export function dataSnapshot() {
  const s = store();
  return {
    nodes: [...s.nodes.values()]
      .map((n) => ({ ...n, neighbors: [...n.neighbors] }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    transitions: s.transitions.map((t) => ({ ...t })),
    aliases: [...s.aliases.entries()]
      .map(([id, names]) => [id, [...names]] as const)
      .sort(([a], [b]) => a.localeCompare(b)),
    categories: [...s.aliasCategories.entries()].sort(([a], [b]) => a.localeCompare(b)),
    placeKinds: s.placeKinds.map((kind) => ({ ...kind })),
    translations: [...s.aliasTranslations.entries()]
      .map(([id, value]) => [id, JSON.stringify(value)] as const)
      .sort(([a], [b]) => a.localeCompare(b)),
  };
}
