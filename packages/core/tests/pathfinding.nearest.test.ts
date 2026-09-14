import { describe, expect, it } from 'vitest';
import { Graph, findNearest, findPath } from '../src/index.js';
import type { PathResult, PathfindingOptions } from '../src/index.js';
import { generateCampus, makeRandom } from './helpers/generatedCampus.js';
import { sampleDataset } from './helpers/sampleDataset.js';

/**
 * Путь до ближайшей из нескольких целей — быстрые кнопки навигатора (запись 19).
 *
 * Оптимальность сверяется с `findPath` до каждой цели: сам `findPath` проверен
 * независимым оракулом (`pathfinding.optimality.test.ts`), а здесь важно, что
 * поиск до множества целей не выбирает цель дальше лучшей.
 */

function segmentsSum(result: PathResult): number {
  return (result.segments ?? []).reduce((sum, segment) => sum + segment.cost, 0);
}

function lastOf(path: readonly string[]): string | undefined {
  return path[path.length - 1];
}

describe('findNearest', () => {
  it('ведёт к ближайшей цели, а не к первой в списке', async () => {
    const graph = Graph.fromDataset(await sampleDataset());
    const targets = ['a3_conference', 'a1_room101', 'b1_library'];

    const result = findNearest(graph, 'campus_gate', targets);
    const costs = targets.map((id) => findPath(graph, 'campus_gate', id).cost);
    const best = Math.min(...costs);

    expect(result.found).toBe(true);
    expect(result.path[0]).toBe('campus_gate');
    expect(lastOf(result.path)).toBe(targets[costs.indexOf(best)]);
    expect(result.cost).toBeCloseTo(best, 9);
    expect(segmentsSum(result)).toBeCloseTo(result.cost, 9);
  });

  it('учитывает ограничения: недостижимая цель не выбирается', async () => {
    const graph = Graph.fromDataset(await sampleDataset());
    const targets = ['a3_room301', 'b1_library'];

    // Третий этаж корпуса А ближе, но попасть туда можно только по лестнице.
    expect(lastOf(findNearest(graph, 'a1_room101', targets).path)).toBe('a3_room301');

    const noStairs = findNearest(graph, 'a1_room101', targets, { allowStairs: false });
    expect(noStairs.found).toBe(true);
    expect(lastOf(noStairs.path)).toBe('b1_library');
  });

  it('старт среди целей — путь из одной точки', async () => {
    const graph = Graph.fromDataset(await sampleDataset());
    const result = findNearest(graph, 'b1_library', ['a1_room101', 'b1_library']);

    expect(result.found).toBe(true);
    expect(result.path).toEqual(['b1_library']);
    expect(result.cost).toBe(0);
  });

  it('называет причину неудачи кодом', async () => {
    const graph = Graph.fromDataset(await sampleDataset());

    expect(findNearest(graph, 'NO_SUCH_NODE', ['b1_library']).reason).toBe('unknown-start');
    expect(findNearest(graph, 'campus_gate', ['NO_SUCH_NODE']).reason).toBe('unknown-end');
    expect(findNearest(graph, 'campus_gate', []).reason).toBe('unknown-end');
    expect(findNearest(graph, 'a1_room101', ['a3_room301'], { allowStairs: false }).reason).toBe('unreachable');
  });

  it('несуществующие цели пропускает', async () => {
    const graph = Graph.fromDataset(await sampleDataset());
    const result = findNearest(graph, 'campus_gate', ['NO_SUCH_NODE', 'b1_library']);

    expect(result.found).toBe(true);
    expect(lastOf(result.path)).toBe('b1_library');
  });

  it.each(['pixel', 'metric'] as const)('на случайных кампусах (%s) стоит столько же, сколько лучший findPath', (mode) => {
    let compared = 0;

    for (let seed = 1; seed <= 40; seed += 1) {
      const random = makeRandom(seed * 7919);
      const campus = generateCampus(random, 2, 3);
      const graph = campus[mode];
      const pick = () => campus.nodeIds[Math.floor(random() * campus.nodeIds.length)];

      const start = pick();
      const targets = Array.from({ length: 1 + Math.floor(random() * 4) }, pick);
      const options: PathfindingOptions =
        seed % 3 === 0 ? { allowStairs: false } : seed % 3 === 1 ? { preferLift: true } : {};

      const reachable = targets.map((id) => findPath(graph, start, id, options)).filter((result) => result.found);
      const nearest = findNearest(graph, start, targets, options);

      if (reachable.length === 0) {
        expect(nearest.found, `seed ${seed}`).toBe(false);
        expect(nearest.reason, `seed ${seed}`).toBe('unreachable');
        continue;
      }

      const best = Math.min(...reachable.map((result) => result.cost));
      expect(nearest.found, `seed ${seed}`).toBe(true);
      expect(nearest.path[0], `seed ${seed}`).toBe(start);
      expect(targets, `seed ${seed}`).toContain(lastOf(nearest.path));
      expect(nearest.cost, `seed ${seed}`).toBeCloseTo(best, 6);
      expect(segmentsSum(nearest), `seed ${seed}`).toBeCloseTo(nearest.cost, 6);
      compared += 1;
    }

    // Проверка без единого сравнения прошла бы на любом коде.
    expect(compared).toBeGreaterThan(20);
  });
});
