import { describe, expect, it } from 'vitest';
import { Graph, createCampusProjection, scopeOfFloor } from '@campus-map/core';
import type { ViewScope } from '@campus-map/core';
import type { MapView } from '../src/utils/mapView';
import { focusBounds, routeRuns, stepFocusPoints as stepFocusPointsIn } from '../src/utils/routeGeometry';
import { FIXTURE_NODES, FIXTURE_TRANSITIONS, fixtureGraph } from './helpers/graphFixture';

/** Карта одного плана — прежнее поведение слоя маршрута. */
const onPlan = (scope: ViewScope): MapView => ({ kind: 'plan', scope });
const visiblePolylines = (path: readonly string[], g: Graph, scope: ViewScope) => routeRuns(path, g, onPlan(scope)).shown;
const stepFocusPoints = (path: readonly string[], range: readonly [number, number], g: Graph, scope: ViewScope) =>
  stepFocusPointsIn(path, range, g, onPlan(scope));

/**
 * Разбиение маршрута на видимые отрезки.
 *
 * Именно здесь маршрут исчезал с экрана: в виде кампуса узлы корпусов не
 * попадают в область видимости, и от пути не остаётся ни одного отрезка.
 */

const graph = fixtureGraph();

const FULL_PATH = [
  'campus_gate',
  'campus_entrance_a',
  'a1_entrance',
  'a1_hall',
  'a1_stairs',
  'a2_stairs',
  'a2_room201',
];

describe('visiblePolylines', () => {
  it('на территории кампуса показывает только уличную часть', () => {
    const segments = visiblePolylines(FULL_PATH, graph, scopeOfFloor(null, null));

    expect(segments).toEqual([
      [
        [750, 600],
        [300, 200],
      ],
    ]);
  });

  it('на этаже показывает только его часть маршрута', () => {
    const segments = visiblePolylines(FULL_PATH, graph, scopeOfFloor('building_a', 1));

    // Три узла первого этажа подряд — один отрезок.
    expect(segments).toHaveLength(1);
    expect(segments[0]).toHaveLength(3);
  });

  it('одиночная видимая точка отрезком не считается', () => {
    // На втором этаже маршрут проходит через два узла, но если взять только
    // один из них, линии быть не должно.
    const segments = visiblePolylines(
      ['a1_hall', 'a2_stairs', 'a1_stairs'],
      graph,
      scopeOfFloor('building_a', 2)
    );

    expect(segments).toEqual([]);
  });

  it('разрывает линию на узлах чужого этажа', () => {
    const path = ['a1_hall', 'a1_stairs', 'a2_stairs', 'a2_room201', 'a2_stairs', 'a1_stairs', 'a1_hall'];
    const segments = visiblePolylines(path, graph, scopeOfFloor('building_a', 1));

    // Заход на первый этаж дважды — два отдельных отрезка.
    expect(segments).toHaveLength(2);
  });

  it('пропускает узлы, которых нет в графе', () => {
    const segments = visiblePolylines(
      ['a1_hall', 'ghost', 'a1_stairs'],
      graph,
      scopeOfFloor('building_a', 1)
    );

    // Несуществующий узел не должен разрывать линию: он не «чужой этаж»,
    // его просто нет, и молча выбросить его правильнее, чем нарисовать разрыв.
    expect(segments).toHaveLength(1);
    expect(segments[0]).toHaveLength(2);
  });

  it('на пустом пути возвращает пустой список', () => {
    expect(visiblePolylines([], graph, scopeOfFloor('building_a', 1))).toEqual([]);
  });
});

describe('stepFocusPoints', () => {
  it('у подъёма по лестнице на этаже прибытия — лестница и следующий узел пути', () => {
    // Участок шага — a1_stairs → a2_stairs (индексы 4–5). На втором этаже из
    // него виден один узел, и без соседа карта приблизилась бы к одной точке.
    expect(stepFocusPoints(FULL_PATH, [4, 5], graph, scopeOfFloor('building_a', 2))).toEqual([
      [300, 270],
      [250, 130],
    ]);
  });

  it('у начала на территории — начало и следующий узел, узлы корпуса не попадают', () => {
    expect(stepFocusPoints(FULL_PATH, [0, 0], graph, scopeOfFloor(null, null))).toEqual([
      [750, 600],
      [300, 200],
    ]);
  });

  it('участок на чужом этаже не даёт ни одной точки', () => {
    expect(stepFocusPoints(FULL_PATH, [0, 1], graph, scopeOfFloor('building_a', 2))).toEqual([]);
  });
});

describe('focusBounds', () => {
  it('близкие точки — прямоугольник минимального размера с тем же центром', () => {
    expect(focusBounds([[300, 200], [300, 270]], 400)).toEqual([
      [100, 35],
      [500, 435],
    ]);
  });

  it('сторона шире минимума не меняется', () => {
    expect(focusBounds([[0, 0], [100, 900]], 400)).toEqual([
      [-150, 0],
      [250, 900],
    ]);
  });

  it('одна точка — квадрат минимального размера вокруг неё', () => {
    expect(focusBounds([[50, 50]], 100)).toEqual([
      [0, 0],
      [100, 100],
    ]);
  });
});

describe('routeRuns на холсте кампуса', () => {
  // Тот же граф в метрах: полметра в пикселе и у территории, и у корпуса.
  const metric = new Graph(
    FIXTURE_NODES,
    FIXTURE_TRANSITIONS,
    createCampusProjection({ buildings: [{ id: 'building_a' }], mapSize: { width: 1000, height: 1000 }, metersPerPixel: 0.5 }, [
      {
        id: 'building_a',
        name: 'Корпус А',
        placement: { metersPerPixel: 0.5, originMeters: { x: 0, y: 0 }, rotationDeg: 0, baseElevationMeters: 0, floorHeightMeters: 3 },
        floors: [{ floor: 1 }, { floor: 2 }],
      },
    ])
  );
  const canvas = (revealed: string[], floor: number): MapView => ({
    kind: 'canvas',
    floors: new Map([['building_a', floor]]),
    revealed: new Set(revealed),
    detailed: true,
  });

  it('корпус не приближен: улица сплошной линией, путь в корпусе просвечивает и продолжает её', () => {
    const runs = routeRuns(FULL_PATH, metric, canvas([], 1));

    expect(runs.shown).toEqual([[[375, 300], [150, 100]]]);
    expect(runs.roofed).toEqual([[[150, 100], [175, 100], [150, 100], [150, 135], [150, 135], [125, 65]]]);
    expect(runs.otherFloors).toEqual([]);
  });

  it('открыт первый этаж: одна линия с улицы до лестницы, второй этаж — отдельно, от неё', () => {
    const runs = routeRuns(FULL_PATH, metric, canvas(['building_a'], 1));

    expect(runs.shown).toEqual([[[375, 300], [150, 100], [175, 100], [150, 100], [150, 135]]]);
    expect(runs.otherFloors).toEqual([[[150, 135], [150, 135], [125, 65]]]);
    expect(runs.roofed).toEqual([]);
  });

  it('точки шага на холсте — все, даже на закрытом этаже: вид не зависит от открытых этажей', () => {
    expect(stepFocusPointsIn(FULL_PATH, [5, 6], metric, canvas([], 1))).toEqual([
      [150, 135],
      [150, 135],
      [125, 65],
    ]);
  });

  it('на карте одного плана невидимых участков нет', () => {
    const runs = routeRuns(FULL_PATH, metric, onPlan(scopeOfFloor('building_a', 2)));

    expect(runs.roofed).toEqual([]);
    expect(runs.otherFloors).toEqual([]);
    expect(runs.shown).toEqual([[[300, 270], [250, 130]]]);
  });
});
