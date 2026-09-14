import { describe, expect, it } from 'vitest';
import { AliasManager, Graph, createCampusProjection, findPath } from '@campus-map/core';
import type { BuildingMeta, CampusMeta, MapNode, PathfindingOptions, Transition } from '@campus-map/core';
import { buildRouteSteps, formatDuration } from '../src/utils/routeInstructions';
import type { Language } from '../src/i18n/languages';

/**
 * Время в пути в карточке маршрута.
 *
 * Само время считает ядро; здесь проверяется только то, как его увидит
 * студент.
 */
describe('formatDuration', () => {
  it('округляет вверх до минуты: опоздать хуже, чем прийти раньше', () => {
    expect(formatDuration(61, 'ru')).toBe('~2 мин');
    expect(formatDuration(120, 'en')).toBe('~2 min');
  });

  it('короткий маршрут показывается минутой, а не нулём', () => {
    expect(formatDuration(0, 'ru')).toBe('~1 мин');
    expect(formatDuration(25, 'en')).toBe('~1 min');
  });
});

/**
 * Шаги маршрута.
 *
 * Своя фикстура, метрическая, в масштабе 1 м на пиксель:
 *
 *   Территория:  gate ── campus_door ══ t1_door (вход в Башню)
 *   Башня, этажи 1–3:  stairs(0,0) ── hall(10,0) ── lift(20,0), room(10,10)
 *                      на 1-м ещё door(10,−10), на 2-м bridge(30,0)
 *                      лестница и лифт — цепочки через все этажи
 *   Пристройка, этаж 2:  bridge(0,0) ── hall(10,0) ── lab(20,0)
 *                        переход Башня-2 ══ Пристройка-2
 */

function node(id: string, building: string, floor: number, x: number, y: number, neighbors: string[], isPortal = false): MapNode {
  return { id, building, floor, x, y, neighbors, isPortal };
}

const NODES: MapNode[] = [
  node('gate', 'CAMPUS', 0, 0, 50, ['campus_door']),
  node('campus_door', 'CAMPUS', 0, 20, 50, ['gate'], true),
  node('t1_door', 'tower', 1, 10, -10, ['t1_hall'], true),
  node('t2_bridge', 'tower', 2, 30, 0, ['t2_lift'], true),
  node('x2_bridge', 'annex', 2, 0, 0, ['x2_hall'], true),
  node('x2_hall', 'annex', 2, 10, 0, ['x2_bridge', 'x2_lab']),
  node('x2_lab', 'annex', 2, 20, 0, ['x2_hall']),
];

for (const floor of [1, 2, 3]) {
  const hallNeighbors = [`t${floor}_stairs`, `t${floor}_lift`, `t${floor}_room`];
  if (floor === 1) hallNeighbors.push('t1_door');
  const liftNeighbors = [`t${floor}_hall`];
  if (floor === 2) liftNeighbors.push('t2_bridge');

  NODES.push(
    node(`t${floor}_stairs`, 'tower', floor, 0, 0, [`t${floor}_hall`], true),
    node(`t${floor}_hall`, 'tower', floor, 10, 0, hallNeighbors),
    node(`t${floor}_lift`, 'tower', floor, 20, 0, liftNeighbors, true),
    node(`t${floor}_room`, 'tower', floor, 10, 10, [`t${floor}_hall`])
  );
}

const TRANSITIONS: Transition[] = [
  { fromNode: 'campus_door', toNode: 't1_door', type: 'entrance' },
  { fromNode: 't1_stairs', toNode: 't2_stairs', type: 'stairs' },
  { fromNode: 't2_stairs', toNode: 't3_stairs', type: 'stairs' },
  { fromNode: 't1_lift', toNode: 't2_lift', type: 'lift' },
  { fromNode: 't2_lift', toNode: 't3_lift', type: 'lift' },
  { fromNode: 't2_bridge', toNode: 'x2_bridge', type: 'bridge' },
];

const CAMPUS: CampusMeta = {
  buildings: [{ id: 'tower' }, { id: 'annex' }],
  mapSize: { width: 100, height: 100 },
  metersPerPixel: 1,
};

const placement = (x: number) => ({
  metersPerPixel: 1,
  originMeters: { x, y: 0 },
  rotationDeg: 0,
  baseElevationMeters: 0,
  floorHeightMeters: 4,
});

const BUILDINGS: BuildingMeta[] = [
  { id: 'tower', name: 'Башня', translations: { en: { name: 'Tower' } }, placement: placement(100), floors: [{ floor: 1 }, { floor: 2 }, { floor: 3 }] },
  { id: 'annex', name: 'Пристройка', translations: { en: { name: 'Annex' } }, placement: placement(200), floors: [{ floor: 2 }] },
];

const BUILDING_METAS = new Map(BUILDINGS.map((meta) => [meta.id, meta]));

const ALIASES = new AliasManager();
ALIASES.load([
  { id: 'gate', names: ['Ворота'], translations: { en: { names: ['Gate'] } } },
  { id: 't1_room', names: ['Т-101'] },
  { id: 't3_room', names: ['Т-301'] },
  { id: 'x2_lab', names: ['Лаборатория'], translations: { en: { names: ['Lab'] } } },
]);

const METRIC = new Graph(NODES, TRANSITIONS, createCampusProjection(CAMPUS, BUILDINGS));
const PIXEL = new Graph(NODES, TRANSITIONS);

function steps(from: string, to: string, options: PathfindingOptions = {}, language: Language = 'ru', graph = METRIC) {
  const route = findPath(graph, from, to, options);
  expect(route.found, `${from} → ${to}`).toBe(true);
  return { route, steps: buildRouteSteps({ graph, route, buildingMetas: BUILDING_METAS, aliasManager: ALIASES, language }) };
}

const text = (list: { title: string; place: string }[]) => list.map((s) => `${s.title} — ${s.place}`);

describe('buildRouteSteps', () => {
  it('маршрут по одному этажу — начало и участок до цели с длиной, а не «старт» и «финиш»', () => {
    const { steps: list } = steps('t1_room', 't1_stairs');

    expect(text(list)).toEqual(['Старт — Т-101, Башня, этаж 1', 'Идите к месту назначения — Башня, этаж 1']);
    // Т-101 (10,10) → холл (10,0) → лестница (0,0): 10 + 10 м.
    expect(list[1].distanceMeters).toBeCloseTo(20, 9);
  });

  it('цепочка лифта через несколько этажей — один шаг, а не по шагу на этаж', () => {
    const { steps: list } = steps('t1_room', 't3_room', { allowStairs: false });

    expect(text(list)).toEqual([
      'Старт — Т-101, Башня, этаж 1',
      'Дойдите до лифта — Башня, этаж 1',
      'Поднимитесь на лифте — Этаж 3',
      'Идите к месту назначения — Т-301, Башня, этаж 3',
    ]);
    expect(list[2].transition).toBe('lift');
  });

  it('вход с территории и переход в другой корпус — отдельные шаги, имена не склоняются', () => {
    const { steps: list } = steps('gate', 'x2_lab');
    const lines = text(list);

    expect(lines).toContain('Дойдите до входа — Кампус');
    expect(lines).toContain('Войдите в здание — Башня, этаж 1');
    expect(lines).toContain('Пройдите по переходу — Пристройка, этаж 2');
    expect(lines[lines.length - 1]).toBe('Идите к месту назначения — Лаборатория, Пристройка, этаж 2');
  });

  it('маршрут, который кончается переходом, завершается прибытием', () => {
    const { steps: list } = steps('t1_hall', 't2_lift', { allowStairs: false });

    expect(text(list)).toEqual([
      'Старт — Башня, этаж 1',
      'Дойдите до лифта — Башня, этаж 1',
      'Поднимитесь на лифте — Этаж 2',
      'Вы на месте — Башня, этаж 2',
    ]);
  });

  it('время шагов складывается во время маршрута', () => {
    // Карточка показывает итог, шаги — участки: они обязаны сходиться.
    const { route, steps: list } = steps('gate', 'x2_lab');
    const sum = list.reduce((acc, s) => acc + (s.durationSeconds ?? 0), 0);

    expect(sum).toBeCloseTo(route.durationSeconds ?? Number.NaN, 9);
  });

  it('в пиксельном режиме у шагов нет ни длины, ни времени', () => {
    const { steps: list } = steps('gate', 'x2_lab', {}, 'ru', PIXEL);

    expect(list.every((s) => s.distanceMeters === null && s.durationSeconds === null)).toBe(true);
  });

  it('по-английски — английские действия и переведённые имена', () => {
    const { steps: list } = steps('gate', 'x2_lab', {}, 'en');
    const lines = text(list);

    expect(lines[0]).toBe('Start — Gate, Campus');
    expect(lines).toContain('Enter the building — Tower, floor 1');
    expect(lines).toContain('Walk through the passage — Annex, floor 2');
  });

  it('участок шага — узлы пути: подход к лифту, поездка, путь до цели', () => {
    const { route, steps: list } = steps('t1_room', 't3_room', { allowStairs: false });

    expect(list.map((s) => s.pathRange)).toEqual([
      [0, 0],
      [0, 2],
      [2, 4],
      [4, 6],
    ]);
    expect(route.path.slice(2, 5)).toEqual(['t1_lift', 't2_lift', 't3_lift']);
  });

  it('участки идут встык и кончаются целью — и с входом, и с переходом, и с прибытием', () => {
    for (const [from, to, options] of [
      ['gate', 'x2_lab', {}],
      ['t1_hall', 't2_lift', { allowStairs: false }],
    ] as const) {
      const { route, steps: list } = steps(from, to, options);

      for (let i = 1; i < list.length; i++) expect(list[i].pathRange[0]).toBe(list[i - 1].pathRange[1]);
      expect(list[list.length - 1].pathRange[1]).toBe(route.path.length - 1);
    }
  });
});
