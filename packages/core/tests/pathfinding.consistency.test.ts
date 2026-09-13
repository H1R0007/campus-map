import { describe, expect, it } from 'vitest';
import { Graph } from '../src/graph/Graph.js';
import { findPath } from '../src/pathfinding/astar.js';
import { WALKING_PROFILE, heuristic, stepCost } from '../src/pathfinding/costModel.js';
import { createCampusProjection } from '../src/projection.js';
import { DEFAULT_PATHFINDING_OPTIONS } from '../src/types/pathfinding.js';
import type { BuildingMeta, PathfindingOptions } from '../src/index.js';
import { loadRealDataset } from './helpers/realDataset.js';
import { generateCampus, makeRandom } from './helpers/generatedCampus.js';

/**
 * Согласованность эвристики метрического режима.
 *
 * A* с эвристикой `h` оптимален, если для каждого шага `a → b` выполнено
 * `cost(a, b) ≥ h(a) − h(b)`. Эвристика здесь — прямое расстояние до цели,
 * делённое на самую быструю скорость модели, поэтому по неравенству
 * треугольника достаточно, чтобы каждый шаг стоил не меньше прямого
 * расстояния между его концами, делённого на ту же скорость.
 *
 * Свойство держится на устройстве модели стоимости, а не на числах в ней.
 * Скидка лифту вместо штрафа лестнице или штраф, способный опустить стоимость
 * ниже физического времени, сломали бы его — и этот тест обязан такое поймать
 * раньше, чем оракул оптимальности наткнётся на неудачный граф.
 */

const OPTION_SETS: PathfindingOptions[] = [
  {},
  { preferLift: true },
  { allowStairs: false, preferLift: true },
  { allowLift: false },
  { allowBridge: false, allowEntrance: false },
];

/** Быстрее этой скорости в модели не движется ничто. */
const FASTEST_SPEED = Math.max(
  WALKING_PROFILE.walkSpeed,
  WALKING_PROFILE.stairsVerticalSpeed,
  WALKING_PROFILE.liftVerticalSpeed
);

/**
 * Шаги, которые стоят меньше прямого пути между их концами.
 *
 * Проверяются оба направления каждого ребра и обе возможности посадки в лифт:
 * стоимость шага зависит от того, как пришли в его начало.
 */
function stepsCheaperThanStraightLine(graph: Graph): string[] {
  const failures: string[] = [];

  for (const options of OPTION_SETS) {
    const resolved = { ...DEFAULT_PATHFINDING_OPTIONS, ...options };

    for (const from of graph.getAllNodes()) {
      const a = graph.getWorld(from.id);

      for (const neighborId of graph.getNeighbors(from.id)) {
        const to = graph.getNode(neighborId);
        const b = graph.getWorld(neighborId);

        if (!to || !a || !b) {
          failures.push(`${from.id} → ${neighborId}: нет узла или мировых координат`);
          continue;
        }

        const type = graph.getTransitionType(from.id, neighborId);
        const bound = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) / FASTEST_SPEED;

        for (const boarding of [false, true]) {
          const cost = stepCost(graph, from, to, type, boarding, resolved);

          if (cost < bound - 1e-9) {
            failures.push(
              `${from.id} → ${neighborId} (${type ?? 'ребро этажа'}, посадка: ${boarding}, ` +
                `опции ${JSON.stringify(options)}): стоимость ${cost.toFixed(4)} < ${bound.toFixed(4)}`
            );
          }
        }
      }
    }
  }

  return failures;
}

describe('согласованность эвристики метрического режима', () => {
  it('ни один шаг сгенерированных кампусов не дешевле прямого пути', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { metric } = generateCampus(makeRandom(seed), 3, 5);

      expect(metric.isMetric).toBe(true);
      expect(stepsCheaperThanStraightLine(metric)).toEqual([]);
    }
  });

  it('ни один шаг реального датасета с условной привязкой не дешевле прямого пути', async () => {
    const { dataset } = await loadRealDataset();

    // Планы в data/ — заглушки, и привязки у них нет. Привязка ниже условная,
    // но топология, типы переходов и координаты узлов — настоящие.
    const buildingMetas: BuildingMeta[] = dataset.buildingMetas.map((meta, index) => ({
      ...meta,
      placement: {
        metersPerPixel: 0.05,
        originMeters: { x: 40 + 120 * index, y: 25 },
        rotationDeg: 30 * index,
        baseElevationMeters: 0.6,
        floorHeightMeters: 3.6,
      },
    }));
    const graph = new Graph(
      dataset.nodes,
      dataset.transitions,
      createCampusProjection({ ...dataset.campusMeta, metersPerPixel: 0.25 }, buildingMetas)
    );

    expect(graph.isMetric).toBe(true);
    expect(stepsCheaperThanStraightLine(graph)).toEqual([]);
  });

  it('оценка остатка не превышает стоимость найденного пути и равна нулю в цели', () => {
    const { metric, nodeIds } = generateCampus(makeRandom(99), 3, 4);
    const random = makeRandom(100);

    for (let pair = 0; pair < 50; pair++) {
      const start = metric.getNode(nodeIds[Math.floor(random() * nodeIds.length)]);
      const goal = metric.getNode(nodeIds[Math.floor(random() * nodeIds.length)]);
      if (!start || !goal) continue;

      expect(heuristic(metric, goal, goal)).toBe(0);

      const result = findPath(metric, start.id, goal.id);
      if (!result.found) continue;

      expect(heuristic(metric, start, goal)).toBeLessThanOrEqual(result.cost + 1e-9);
    }
  });
});
