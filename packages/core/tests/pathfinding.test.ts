import { describe, expect, it } from 'vitest';
import { Graph, findAlternativePaths, findPath } from '../src/index.js';
import type { MapNode, PathfindingOptions } from '../src/index.js';
import { fixtureDataset } from './helpers/datasetFixture.js';

function node(id: string, x: number, y: number, building = 'b', floor = 1, neighbors: string[] = []): MapNode {
  return { id, x, y, building, floor, neighbors, isPortal: false };
}

/** Сумма стоимостей шагов маршрута. */
function segmentsSum(segments: { distance: number }[] | undefined): number {
  return (segments ?? []).reduce((sum, segment) => sum + segment.distance, 0);
}

describe('findPath', () => {
  it('находит маршруты фиксированной длины (регрессия)', async () => {
    const graph = Graph.fromDataset(await fixtureDataset());

    const cases: [string, string, number][] = [
      ['campus_gate', 'a3_conference', 11],
      ['campus_gate', 'c1_pool', 7],
      ['a1_room101', 'b2_lab', 15],
      ['campus_gate', 'a1_room101', 8],
    ];

    for (const [from, to, hops] of cases) {
      const result = findPath(graph, from, to);

      expect(result.found, `${from} -> ${to}`).toBe(true);
      expect(result.path, `${from} -> ${to}`).toHaveLength(hops);
      expect(result.totalDistance).toBeGreaterThan(0);
    }
  });

  it('старт совпадает с финишем: нулевая стоимость и нет шагов', async () => {
    const graph = Graph.fromDataset(await fixtureDataset());
    const result = findPath(graph, 'campus_gate', 'campus_gate');

    expect(result.found).toBe(true);
    expect(result.path).toEqual(['campus_gate']);
    expect(result.totalDistance).toBe(0);
    expect(result.segments).toHaveLength(0);
  });

  it('для недостижимой цели возвращает found=false и причину', async () => {
    const graph = Graph.fromDataset(await fixtureDataset());
    const result = findPath(graph, 'campus_gate', 'NO_SUCH_NODE');

    expect(result.found).toBe(false);
    expect(result.path).toEqual([]);
    expect(result.error).toBeDefined();
  });

  it('сообщение об ошибке на русском', async () => {
    const graph = Graph.fromDataset(await fixtureDataset());

    expect(findPath(graph, 'campus_gate', 'NO_SUCH_NODE').error).toMatch(/[а-яА-Я]/);
  });

  it('сумма стоимостей шагов равна totalDistance при любых опциях', async () => {
    const graph = Graph.fromDataset(await fixtureDataset());

    const optionSets: PathfindingOptions[] = [
      {},
      { preferLift: true },
      { allowLift: false },
      { allowStairs: false },
      { preferLift: true, allowBridge: false },
    ];

    for (const options of optionSets) {
      const result = findPath(graph, 'a1_room101', 'a3_room301', options);
      if (!result.found) continue;

      // Расхождение здесь означало бы, что preferLift меняет веса рёбер,
      // но не пересчитывает стоимости шагов — пользователь увидел бы
      // «1200 м», а в разбивке было бы 900.
      expect(
        Math.abs(segmentsSum(result.segments) - result.totalDistance),
        JSON.stringify(options)
      ).toBeLessThan(1e-9);
    }
  });

  it('согласованность сохраняется на маршруте через несколько корпусов', async () => {
    const graph = Graph.fromDataset(await fixtureDataset());
    const result = findPath(graph, 'campus_gate', 'a3_conference', { preferLift: true });

    expect(result.found).toBe(true);
    expect(
      Math.abs(segmentsSum(result.segments) - result.totalDistance)
    ).toBeLessThan(1e-9);
  });

  it('allowStairs:false отрезает этаж, доступный только по лестнице', async () => {
    const graph = Graph.fromDataset(await fixtureDataset());

    expect(findPath(graph, 'a1_room101', 'a3_room301', { allowStairs: false }).found).toBe(false);
  });

  it('allowEntrance:false отрезает корпуса от территории кампуса', async () => {
    const graph = Graph.fromDataset(await fixtureDataset());

    expect(findPath(graph, 'campus_gate', 'a1_room101', { allowEntrance: false }).found).toBe(false);
  });

  it('запрет типа перехода не мешает маршруту внутри этажа', async () => {
    const graph = Graph.fromDataset(await fixtureDataset());
    const result = findPath(graph, 'a1_room101', 'a1_room102', {
      allowStairs: false,
      allowLift: false,
      allowBridge: false,
      allowEntrance: false,
    });

    expect(result.found).toBe(true);
  });

  it('не зацикливается на данных с петлёй в neighbors', () => {
    // Узел ссылается сам на себя — защита от битых данных.
    const graph = new Graph([node('a', 0, 0, 'b', 1, ['a', 'b']), node('b', 10, 0, 'b', 1, ['a'])], []);
    const result = findPath(graph, 'a', 'b');

    expect(result.found).toBe(true);
    expect(result.path).toEqual(['a', 'b']);
  });

  it('останавливается по maxIterations и сообщает об этом', () => {
    const nodes: MapNode[] = [];
    for (let i = 0; i < 50; i += 1) {
      nodes.push(node(`n${i}`, i * 10, 0, 'b', 1, i + 1 < 50 ? [`n${i + 1}`] : []));
    }
    const graph = new Graph(nodes, []);

    const result = findPath(graph, 'n0', 'n49', { maxIterations: 5 });

    expect(result.found).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe('findAlternativePaths', () => {
  it('возвращает основной путь и альтернативы', async () => {
    const graph = Graph.fromDataset(await fixtureDataset());
    const result = findAlternativePaths(graph, 'campus_gate', 'a3_conference', {}, 3);

    expect(result.primary.found).toBe(true);
    // Датасет по топологии близок к дереву: независимых объездов нет.
    expect(result.alternatives).toEqual([]);
  });

  it('maxPaths меньше двух — альтернатив не ищет', async () => {
    const graph = Graph.fromDataset(await fixtureDataset());

    expect(findAlternativePaths(graph, 'campus_gate', 'a3_conference', {}, 1).alternatives).toEqual([]);
  });

  it('результат детерминирован', async () => {
    const graph = Graph.fromDataset(await fixtureDataset());

    const first = findAlternativePaths(graph, 'campus_gate', 'c1_pool', {}, 3);
    const second = findAlternativePaths(graph, 'campus_gate', 'c1_pool', {}, 3);

    expect(first).toEqual(second);
  });

  it('находит действительно разные маршруты, когда они существуют', () => {
    // Два параллельных коридора между a и d: короткий и длинный.
    const graph = new Graph(
      [
        node('a', 0, 0, 'b', 1, ['b', 'c']),
        node('b', 10, 0, 'b', 1, ['d']),
        node('c', 10, 50, 'b', 1, ['d']),
        node('d', 20, 0, 'b', 1, []),
      ],
      []
    );

    const result = findAlternativePaths(graph, 'a', 'd', {}, 3);

    expect(result.primary.found).toBe(true);
    expect(result.primary.path).toEqual(['a', 'b', 'd']);
    expect(result.alternatives.length).toBeGreaterThan(0);
    expect(result.alternatives[0].path).not.toEqual(result.primary.path);
  });
});
