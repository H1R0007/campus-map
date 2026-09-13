import { describe, expect, it } from 'vitest';
import { findPath } from '../src/pathfinding/astar.js';
import type { Graph } from '../src/graph/Graph.js';
import type { MapNode, PathfindingOptions, TransitionType, WorldPoint } from '../src/index.js';
import { generateCampus, makeRandom } from './helpers/generatedCampus.js';
import type { GeneratedCampus } from './helpers/generatedCampus.js';

/**
 * Оптимальность A* против полного перебора — в обоих режимах модели стоимости.
 *
 * Этого теста не хватало, чтобы заметить настоящий дефект: эвристикой было
 * евклидово расстояние без учёта этажа, то есть разность координат из двух
 * несвязанных пиксельных систем. Она переоценивала остаток, и A* с закрытым
 * множеством возвращал строго неоптимальный маршрут.
 *
 * С метрикой эвристика снова ненулевая, и именно здесь ошибка вернулась бы
 * первой: скидка лифту вместо штрафа лестнице, деление не на ту скорость,
 * ожидание лифта на каждом этаже поездки.
 *
 * Оракул — Дейкстра по состояниям «узел + приехали ли на лифте», написанная
 * здесь заново и намеренно наивно, со своей копией модели стоимости и своим
 * расчётом мировых координат: если он переиспользует код ядра, он перестаёт
 * быть независимой проверкой.
 */

/* ------------------------------------------------------------------ */
/* Независимая модель стоимости                                        */
/* ------------------------------------------------------------------ */

type Resolved = Required<PathfindingOptions>;

const PIXEL_WEIGHTS: Record<TransitionType, number> = {
  entrance: 5,
  lift: 15,
  bridge: 25,
  stairs: 40,
};

// Физика метрического режима — копия чисел ядра, намеренная.
const WALK_SPEED = 1.3;
const STAIRS_VERTICAL_SPEED = 0.2;
const LIFT_VERTICAL_SPEED = 1.0;
const LIFT_WAIT_SECONDS = 30;
const ENTRANCE_SECONDS = 10;
const PREFER_LIFT_STAIRS_FACTOR = 3;
const CROSS_FLOOR_PENALTY = 10_000;

function allowed(type: TransitionType | null, options: Resolved): boolean {
  if (type === 'stairs') return options.allowStairs;
  if (type === 'lift') return options.allowLift;
  if (type === 'bridge') return options.allowBridge;
  if (type === 'entrance') return options.allowEntrance;
  return true;
}

function onSameFloor(a: MapNode, b: MapNode): boolean {
  return a.building === b.building && a.floor === b.floor;
}

function pixelCost(a: MapNode, b: MapNode, type: TransitionType | null, options: Resolved): number {
  if (!allowed(type, options)) return Number.POSITIVE_INFINITY;

  if (type === 'stairs') return options.preferLift ? PIXEL_WEIGHTS.stairs * 1.5 : PIXEL_WEIGHTS.stairs;
  if (type === 'lift') return options.preferLift ? PIXEL_WEIGHTS.lift * 0.7 : PIXEL_WEIGHTS.lift;
  if (type !== null) return PIXEL_WEIGHTS[type];

  return onSameFloor(a, b) ? Math.hypot(a.x - b.x, a.y - b.y) : CROSS_FLOOR_PENALTY;
}

function metricCost(
  a: MapNode,
  b: MapNode,
  wa: WorldPoint,
  wb: WorldPoint,
  type: TransitionType | null,
  boarding: boolean,
  options: Resolved
): number {
  if (!allowed(type, options)) return Number.POSITIVE_INFINITY;

  const walking = Math.hypot(wa.x - wb.x, wa.y - wb.y) / WALK_SPEED;
  const rise = Math.abs(wa.z - wb.z);

  const seconds =
    type === 'lift'
      ? walking + rise / LIFT_VERTICAL_SPEED + (boarding ? LIFT_WAIT_SECONDS : 0)
      : walking + rise / STAIRS_VERTICAL_SPEED + (type === 'entrance' ? ENTRANCE_SECONDS : 0);

  if (type === null && !onSameFloor(a, b)) return Math.max(CROSS_FLOOR_PENALTY, seconds);
  if (type === 'stairs' && options.preferLift) return seconds * PREFER_LIFT_STAIRS_FACTOR;
  return seconds;
}

/** Стоимость шага; `boarding` — к началу шага пришли не на лифте. */
type OracleCost = (a: MapNode, b: MapNode, type: TransitionType | null, boarding: boolean) => number;

/**
 * Дейкстра простым перебором по состояниям «узел + приехали ли на лифте».
 *
 * Медленно и намеренно: единственная задача — быть заведомо правильной.
 *
 * @returns стоимость кратчайшего пути либо `null`, если пути нет
 */
function dijkstra(graph: Graph, startId: string, endId: string, cost: OracleCost): number | null {
  interface Entry {
    nodeId: string;
    inLift: boolean;
    d: number;
  }

  // Префикс из одного символа однозначно отделяет состояние от id.
  const key = (nodeId: string, inLift: boolean) => `${inLift ? 'L' : 'W'}${nodeId}`;

  const dist = new Map<string, Entry>([[key(startId, false), { nodeId: startId, inLift: false, d: 0 }]]);
  const visited = new Set<string>();

  for (;;) {
    let current: Entry | null = null;

    for (const [stateKey, entry] of dist) {
      if (!visited.has(stateKey) && (current === null || entry.d < current.d)) {
        current = entry;
      }
    }

    if (current === null) return null;
    if (current.nodeId === endId) return current.d;

    visited.add(key(current.nodeId, current.inLift));

    const node = graph.getNode(current.nodeId);
    if (!node) continue;

    for (const neighborId of graph.getNeighbors(current.nodeId)) {
      const neighbor = graph.getNode(neighborId);
      if (!neighbor) continue;

      const type = graph.getTransitionType(current.nodeId, neighborId);
      const step = cost(node, neighbor, type, type === 'lift' && !current.inLift);
      if (!Number.isFinite(step)) continue;

      const next = { nodeId: neighborId, inLift: type === 'lift', d: current.d + step };
      const nextKey = key(next.nodeId, next.inLift);

      if (next.d < (dist.get(nextKey)?.d ?? Number.POSITIVE_INFINITY)) {
        dist.set(nextKey, next);
      }
    }
  }
}

/* ------------------------------------------------------------------ */

const OPTION_SETS: PathfindingOptions[] = [
  {},
  { preferLift: true },
  { allowLift: false },
  { allowStairs: false },
  { allowBridge: false, allowEntrance: false },
];

function withDefaults(options: PathfindingOptions): Resolved {
  return {
    allowStairs: options.allowStairs ?? true,
    allowLift: options.allowLift ?? true,
    allowBridge: options.allowBridge ?? true,
    allowEntrance: options.allowEntrance ?? true,
    preferLift: options.preferLift ?? false,
    maxIterations: options.maxIterations ?? 50_000,
  };
}

type Mode = 'pixel' | 'metric';

/** Модель стоимости оракула для режима сгенерированного кампуса. */
function oracleCost(campus: GeneratedCampus, mode: Mode, options: Resolved): OracleCost {
  return mode === 'pixel'
    ? (a, b, type) => pixelCost(a, b, type, options)
    : (a, b, type, boarding) =>
        metricCost(a, b, campus.worldOf(a), campus.worldOf(b), type, boarding, options);
}

const MODES: { mode: Mode; title: string }[] = [
  { mode: 'pixel', title: 'пиксельный режим' },
  { mode: 'metric', title: 'метрический режим' },
];

describe.each(MODES)('оптимальность A*: $title', ({ mode }) => {
  it('совпадает с Дейкстрой на случайных многоэтажных графах', () => {
    const failures: string[] = [];

    for (let seed = 1; seed <= 40; seed++) {
      const random = makeRandom(seed);
      const campus = generateCampus(random, 3, 4);
      const graph = campus[mode];

      // Без этой проверки «метрический» прогон молча проверял бы пиксельный.
      expect(graph.isMetric).toBe(mode === 'metric');

      for (const options of OPTION_SETS) {
        const cost = oracleCost(campus, mode, withDefaults(options));

        // Несколько пар на граф: перебирать все — лишние секунды без пользы.
        for (let pair = 0; pair < 6; pair++) {
          const startId = campus.nodeIds[Math.floor(random() * campus.nodeIds.length)];
          const endId = campus.nodeIds[Math.floor(random() * campus.nodeIds.length)];
          if (startId === endId) continue;

          const expected = dijkstra(graph, startId, endId, cost);
          const actual = findPath(graph, startId, endId, options);

          if (expected === null) {
            if (actual.found) {
              failures.push(`seed=${seed} ${startId}->${endId}: путь найден, хотя его нет`);
            }
            continue;
          }

          if (!actual.found) {
            failures.push(`seed=${seed} ${startId}->${endId}: путь не найден, хотя он есть`);
            continue;
          }

          if (Math.abs(actual.cost - expected) > 1e-6) {
            failures.push(
              `seed=${seed} ${startId}->${endId} opts=${JSON.stringify(options)}: ` +
                `A* дал ${actual.cost.toFixed(3)}, оптимум ${expected.toFixed(3)}`
            );
          }
        }
      }
    }

    expect(failures).toEqual([]);
  });

  it('сумма шагов совпадает с итогом и на сгенерированных графах', () => {
    const random = makeRandom(777);
    const campus = generateCampus(random, 2, 5);

    for (const options of OPTION_SETS) {
      for (let pair = 0; pair < 10; pair++) {
        const startId = campus.nodeIds[Math.floor(random() * campus.nodeIds.length)];
        const endId = campus.nodeIds[Math.floor(random() * campus.nodeIds.length)];

        const result = findPath(campus[mode], startId, endId, options);
        if (!result.found || !result.segments) continue;

        const sum = result.segments.reduce((acc, segment) => acc + segment.cost, 0);
        expect(sum).toBeCloseTo(result.cost, 6);
      }
    }
  });

  it('найденный путь действительно проходит по рёбрам графа', () => {
    const random = makeRandom(2024);
    const campus = generateCampus(random, 3, 3);
    const graph = campus[mode];

    for (let pair = 0; pair < 30; pair++) {
      const startId = campus.nodeIds[Math.floor(random() * campus.nodeIds.length)];
      const endId = campus.nodeIds[Math.floor(random() * campus.nodeIds.length)];

      const result = findPath(graph, startId, endId);
      if (!result.found) continue;

      expect(result.path[0]).toBe(startId);
      expect(result.path[result.path.length - 1]).toBe(endId);

      for (let i = 1; i < result.path.length; i++) {
        expect(graph.getNeighbors(result.path[i - 1])).toContain(result.path[i]);
      }
    }
  });
});

describe('метрический режим: стоимость и время', () => {
  it('без предпочтений стоимость найденного пути равна времени в пути', () => {
    // Расходиться они вправе только из-за предпочтений. Иначе поиск
    // оптимизировал бы одно, а навигатор показывал другое.
    const random = makeRandom(4242);
    const campus = generateCampus(random, 3, 4);

    for (let pair = 0; pair < 30; pair++) {
      const startId = campus.nodeIds[Math.floor(random() * campus.nodeIds.length)];
      const endId = campus.nodeIds[Math.floor(random() * campus.nodeIds.length)];

      const result = findPath(campus.metric, startId, endId, { allowLift: false });
      if (!result.found) continue;

      expect(result.durationSeconds).not.toBeNull();
      expect(result.cost).toBeCloseTo(result.durationSeconds ?? Number.NaN, 6);
    }
  });
});
