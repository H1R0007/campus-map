import { describe, expect, it } from 'vitest';
import { Graph } from '../src/graph/Graph.js';
import { findPath } from '../src/pathfinding/astar.js';
import type { MapNode, PathfindingOptions, Transition, TransitionType } from '../src/index.js';

/**
 * Оптимальность A* против полного перебора.
 *
 * Этого теста не хватало, чтобы заметить настоящий дефект: эвристикой было
 * евклидово расстояние без учёта этажа, то есть разность координат из двух
 * несвязанных пиксельных систем. Она переоценивала остаток, и A* с закрытым
 * множеством возвращал строго неоптимальный маршрут.
 *
 * Существующие тесты маршрутов проверяли количество шагов и согласованность
 * суммы сегментов с итогом — оба свойства сохраняются и у неоптимального
 * пути, поэтому дефект проходил мимо них.
 *
 * Оракул — Дейкстра, написанная здесь заново и намеренно наивно: если она
 * переиспользует код ядра, она перестаёт быть независимой проверкой.
 */

/* ------------------------------------------------------------------ */
/* Генератор графов                                                    */
/* ------------------------------------------------------------------ */

/**
 * Детерминированный ГПСЧ (mulberry32).
 *
 * `Math.random()` сделал бы падение теста невоспроизводимым: сообщение
 * «маршрут неоптимален» без входных данных бесполезно.
 */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TRANSITION_TYPES: TransitionType[] = ['stairs', 'lift', 'bridge', 'entrance'];

interface GeneratedGraph {
  graph: Graph;
  nodeIds: string[];
}

/**
 * Случайный многоэтажный граф.
 *
 * Строится так, чтобы воспроизводить причину дефекта: несколько этажей,
 * координаты в независимых пиксельных системах и несколько параллельных
 * вертикальных связей — тогда у поиска есть выбор, и ошибка эвристики
 * приводит к другому ответу, а не к тому же самому.
 */
function generateGraph(random: () => number, buildings: number, floors: number): GeneratedGraph {
  const nodes: MapNode[] = [];
  const transitions: Transition[] = [];
  const nodeIds: string[] = [];

  const nodesPerFloor = 5;

  for (let b = 0; b < buildings; b++) {
    const building = `b${b}`;

    for (let f = 1; f <= floors; f++) {
      const floorNodes: MapNode[] = [];

      for (let n = 0; n < nodesPerFloor; n++) {
        const id = `${building}_f${f}_n${n}`;

        floorNodes.push({
          id,
          building,
          floor: f,
          // Разброс координат по этажам намеренно большой: так разность
          // координат между этажами заведомо больше веса перехода.
          x: Math.round(random() * 2000),
          y: Math.round(random() * 2000),
          neighbors: [],
          isPortal: false,
        });

        nodeIds.push(id);
      }

      // Цепочка + случайные хорды: граф связен, но не дерево.
      for (let n = 1; n < floorNodes.length; n++) {
        floorNodes[n - 1].neighbors.push(floorNodes[n].id);
        floorNodes[n].neighbors.push(floorNodes[n - 1].id);
      }
      for (let n = 0; n < floorNodes.length; n++) {
        if (random() < 0.3) {
          const other = Math.floor(random() * floorNodes.length);
          if (other !== n) {
            floorNodes[n].neighbors.push(floorNodes[other].id);
            floorNodes[other].neighbors.push(floorNodes[n].id);
          }
        }
      }

      nodes.push(...floorNodes);

      // Две вертикальные связи между соседними этажами — лестница и лифт из
      // разных узлов. Именно выбор между ними ломался при плохой эвристике.
      if (f > 1) {
        transitions.push({
          fromNode: `${building}_f${f - 1}_n0`,
          toNode: `${building}_f${f}_n0`,
          type: 'stairs',
        });
        transitions.push({
          fromNode: `${building}_f${f - 1}_n${nodesPerFloor - 1}`,
          toNode: `${building}_f${f}_n${nodesPerFloor - 1}`,
          type: 'lift',
        });
      }
    }

    // Связь с предыдущим корпусом случайным типом перехода.
    if (b > 0) {
      transitions.push({
        fromNode: `b${b - 1}_f1_n2`,
        toNode: `${building}_f1_n2`,
        type: TRANSITION_TYPES[Math.floor(random() * TRANSITION_TYPES.length)],
      });
    }
  }

  return { graph: new Graph(nodes, transitions), nodeIds };
}

/* ------------------------------------------------------------------ */
/* Независимый оракул                                                  */
/* ------------------------------------------------------------------ */

const TRANSITION_WEIGHTS: Record<TransitionType, number> = {
  entrance: 5,
  lift: 15,
  bridge: 25,
  stairs: 40,
};

/** Копия модели стоимости ядра. Намеренная — оракул обязан быть независимым. */
function oracleEdgeCost(
  a: MapNode,
  b: MapNode,
  type: TransitionType | null,
  options: Required<PathfindingOptions>
): number {
  if (type !== null) {
    if (type === 'stairs') {
      if (!options.allowStairs) return Number.POSITIVE_INFINITY;
      return options.preferLift ? TRANSITION_WEIGHTS.stairs * 1.5 : TRANSITION_WEIGHTS.stairs;
    }
    if (type === 'lift') {
      if (!options.allowLift) return Number.POSITIVE_INFINITY;
      return options.preferLift ? TRANSITION_WEIGHTS.lift * 0.7 : TRANSITION_WEIGHTS.lift;
    }
    if (type === 'bridge') {
      return options.allowBridge ? TRANSITION_WEIGHTS.bridge : Number.POSITIVE_INFINITY;
    }
    return options.allowEntrance ? TRANSITION_WEIGHTS.entrance : Number.POSITIVE_INFINITY;
  }

  if (a.building === b.building && a.floor === b.floor) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  return 10_000;
}

/**
 * Дейкстра простым перебором очереди.
 *
 * Медленно и намеренно: единственная задача — быть заведомо правильной.
 *
 * @returns стоимость кратчайшего пути либо `null`, если пути нет
 */
function dijkstra(
  graph: Graph,
  startId: string,
  endId: string,
  options: Required<PathfindingOptions>
): number | null {
  const dist = new Map<string, number>([[startId, 0]]);
  const visited = new Set<string>();

  for (;;) {
    let currentId: string | null = null;
    let best = Number.POSITIVE_INFINITY;

    for (const [id, d] of dist) {
      if (!visited.has(id) && d < best) {
        best = d;
        currentId = id;
      }
    }

    if (currentId === null) break;
    if (currentId === endId) return best;

    visited.add(currentId);

    const currentNode = graph.getNode(currentId);
    if (!currentNode) continue;

    for (const neighborId of graph.getNeighbors(currentId)) {
      const neighborNode = graph.getNode(neighborId);
      if (!neighborNode) continue;

      const cost = oracleEdgeCost(
        currentNode,
        neighborNode,
        graph.getTransitionType(currentId, neighborId),
        options
      );
      if (!Number.isFinite(cost)) continue;

      const candidate = best + cost;
      if (candidate < (dist.get(neighborId) ?? Number.POSITIVE_INFINITY)) {
        dist.set(neighborId, candidate);
      }
    }
  }

  return null;
}

/* ------------------------------------------------------------------ */

const OPTION_SETS: PathfindingOptions[] = [
  {},
  { preferLift: true },
  { allowLift: false },
  { allowStairs: false },
  { allowBridge: false, allowEntrance: false },
];

function withDefaults(options: PathfindingOptions): Required<PathfindingOptions> {
  return {
    allowStairs: options.allowStairs ?? true,
    allowLift: options.allowLift ?? true,
    allowBridge: options.allowBridge ?? true,
    allowEntrance: options.allowEntrance ?? true,
    preferLift: options.preferLift ?? false,
    maxIterations: options.maxIterations ?? 50_000,
  };
}

describe('оптимальность A*', () => {
  it('совпадает с Дейкстрой на случайных многоэтажных графах', () => {
    const failures: string[] = [];

    for (let seed = 1; seed <= 40; seed++) {
      const random = makeRandom(seed);
      const { graph, nodeIds } = generateGraph(random, 3, 4);

      for (const options of OPTION_SETS) {
        const resolved = withDefaults(options);

        // Несколько пар на граф: перебирать все — лишние секунды без пользы.
        for (let pair = 0; pair < 6; pair++) {
          const startId = nodeIds[Math.floor(random() * nodeIds.length)];
          const endId = nodeIds[Math.floor(random() * nodeIds.length)];
          if (startId === endId) continue;

          const expected = dijkstra(graph, startId, endId, resolved);
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

          if (Math.abs(actual.totalDistance - expected) > 1e-6) {
            failures.push(
              `seed=${seed} ${startId}->${endId} opts=${JSON.stringify(options)}: ` +
                `A* дал ${actual.totalDistance.toFixed(3)}, оптимум ${expected.toFixed(3)}`
            );
          }
        }
      }
    }

    expect(failures).toEqual([]);
  });

  it('сумма шагов совпадает с итогом и на сгенерированных графах', () => {
    const random = makeRandom(777);
    const { graph, nodeIds } = generateGraph(random, 2, 5);

    for (const options of OPTION_SETS) {
      for (let pair = 0; pair < 10; pair++) {
        const startId = nodeIds[Math.floor(random() * nodeIds.length)];
        const endId = nodeIds[Math.floor(random() * nodeIds.length)];

        const result = findPath(graph, startId, endId, options);
        if (!result.found || !result.segments) continue;

        const sum = result.segments.reduce((acc, segment) => acc + segment.distance, 0);
        expect(sum).toBeCloseTo(result.totalDistance, 6);
      }
    }
  });

  it('найденный путь действительно проходит по рёбрам графа', () => {
    const random = makeRandom(2024);
    const { graph, nodeIds } = generateGraph(random, 3, 3);

    for (let pair = 0; pair < 30; pair++) {
      const startId = nodeIds[Math.floor(random() * nodeIds.length)];
      const endId = nodeIds[Math.floor(random() * nodeIds.length)];

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
