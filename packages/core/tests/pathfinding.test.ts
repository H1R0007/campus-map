import { describe, expect, it } from 'vitest';
import { Graph, createCampusProjection, findAlternativePaths, findPath } from '../src/index.js';
import type { BuildingMeta, CampusMeta, MapNode, PathfindingOptions, Transition } from '../src/index.js';
import { sampleDataset } from './helpers/sampleDataset.js';

function node(id: string, x: number, y: number, building = 'b', floor = 1, neighbors: string[] = []): MapNode {
  return { id, x, y, building, floor, neighbors, isPortal: false };
}

/** Сумма стоимостей шагов маршрута. */
function segmentsSum(segments: { cost: number }[] | undefined): number {
  return (segments ?? []).reduce((sum, segment) => sum + segment.cost, 0);
}

describe('findPath', () => {
  it('находит маршруты фиксированной длины (регрессия)', async () => {
    const graph = Graph.fromDataset(await sampleDataset());

    // Число узлов пути; сами пути видны на схеме в `helpers/sampleDataset.ts`.
    const cases: [string, string, number][] = [
      ['campus_gate', 'a3_conference', 10],
      ['campus_gate', 'a1_room101', 7],
      ['a1_room101', 'a3_room301', 8],
      ['a1_room101', 'b1_library', 10],
    ];

    for (const [from, to, hops] of cases) {
      const result = findPath(graph, from, to);

      expect(result.found, `${from} -> ${to}`).toBe(true);
      expect(result.path, `${from} -> ${to}`).toHaveLength(hops);
      expect(result.cost).toBeGreaterThan(0);
    }
  });

  it('старт совпадает с финишем: нулевая стоимость и нет шагов', async () => {
    const graph = Graph.fromDataset(await sampleDataset());
    const result = findPath(graph, 'campus_gate', 'campus_gate');

    expect(result.found).toBe(true);
    expect(result.path).toEqual(['campus_gate']);
    expect(result.cost).toBe(0);
    expect(result.segments).toHaveLength(0);
  });

  it('для недостижимой цели возвращает found=false и причину', async () => {
    const graph = Graph.fromDataset(await sampleDataset());
    const result = findPath(graph, 'campus_gate', 'NO_SUCH_NODE');

    expect(result.found).toBe(false);
    expect(result.path).toEqual([]);
    expect(result.error).toBeDefined();
  });

  it('сообщение об ошибке на русском', async () => {
    const graph = Graph.fromDataset(await sampleDataset());

    expect(findPath(graph, 'campus_gate', 'NO_SUCH_NODE').error).toMatch(/[а-яА-Я]/);
  });

  it('сумма стоимостей шагов равна стоимости пути при любых опциях', async () => {
    const graph = Graph.fromDataset(await sampleDataset());

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

      // Расхождение здесь означало бы, что preferLift меняет стоимость рёбер,
      // но не пересчитывает стоимость шагов — итог и разбивка маршрута
      // описывали бы разные пути.
      expect(
        Math.abs(segmentsSum(result.segments) - result.cost),
        JSON.stringify(options)
      ).toBeLessThan(1e-9);
    }
  });

  it('согласованность сохраняется на маршруте через несколько корпусов', async () => {
    const graph = Graph.fromDataset(await sampleDataset());
    const result = findPath(graph, 'campus_gate', 'a3_conference', { preferLift: true });

    expect(result.found).toBe(true);
    expect(
      Math.abs(segmentsSum(result.segments) - result.cost)
    ).toBeLessThan(1e-9);
  });

  it('allowStairs:false отрезает этаж, доступный только по лестнице', async () => {
    const graph = Graph.fromDataset(await sampleDataset());

    expect(findPath(graph, 'a1_room101', 'a3_room301', { allowStairs: false }).found).toBe(false);
  });

  it('allowEntrance:false отрезает корпуса от территории кампуса', async () => {
    const graph = Graph.fromDataset(await sampleDataset());

    expect(findPath(graph, 'campus_gate', 'a1_room101', { allowEntrance: false }).found).toBe(false);
  });

  it('запрет типа перехода не мешает маршруту внутри этажа', async () => {
    const graph = Graph.fromDataset(await sampleDataset());
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

describe('findPath: время и длина пути', () => {
  /**
   * Корпус из четырёх этажей высотой 4 м, план в масштабе 1 м на пиксель.
   * На каждом этаже холл посередине: лестница в 5 м левее, лифт в 5 м
   * правее. Лестница и лифт — цепочки переходов через все этажи, как их и
   * размечают в данных.
   */
  function tower(): Graph {
    const nodes: MapNode[] = [];
    const transitions: Transition[] = [];

    for (let floor = 1; floor <= 4; floor++) {
      nodes.push(
        node(`f${floor}_stairs`, 0, 0, 'tower', floor, [`f${floor}_hall`]),
        node(`f${floor}_hall`, 5, 0, 'tower', floor, [`f${floor}_stairs`, `f${floor}_lift`]),
        node(`f${floor}_lift`, 10, 0, 'tower', floor, [`f${floor}_hall`])
      );

      if (floor > 1) {
        transitions.push({ fromNode: `f${floor - 1}_stairs`, toNode: `f${floor}_stairs`, type: 'stairs' });
        transitions.push({ fromNode: `f${floor - 1}_lift`, toNode: `f${floor}_lift`, type: 'lift' });
      }
    }

    const campus: CampusMeta = {
      buildings: [{ id: 'tower' }],
      mapSize: { width: 20, height: 20 },
      metersPerPixel: 1,
    };
    const building: BuildingMeta = {
      id: 'tower',
      name: 'Башня',
      placement: {
        metersPerPixel: 1,
        originMeters: { x: 0, y: 0 },
        rotationDeg: 0,
        baseElevationMeters: 0,
        floorHeightMeters: 4,
      },
      floors: [1, 2, 3, 4].map((floor) => ({ floor })),
    };

    return new Graph(nodes, transitions, createCampusProjection(campus, [building]));
  }

  /** Ходьба от холла до лестницы или лифта: 5 м со скоростью 1,3 м/с. */
  const HALL_WALK = 5 / 1.3;

  it('в пиксельном режиме ни длины, ни времени нет', async () => {
    const graph = Graph.fromDataset(await sampleDataset());
    const result = findPath(graph, 'a1_room101', 'a3_room301');

    expect(result.found).toBe(true);
    expect(result.distanceMeters).toBeNull();
    expect(result.durationSeconds).toBeNull();
  });

  it('ожидание лифта входит в поездку один раз, а не на каждом этаже', () => {
    const result = findPath(tower(), 'f1_hall', 'f4_hall');

    // Лифт: 30 с ожидания и 12 м подъёма за 12 с. Лестница: те же 12 м за
    // 60 с. С ожиданием на каждом этаже (90 с) лифт проиграл бы лестнице.
    expect(result.path).toContain('f2_lift');
    expect(result.durationSeconds).toBeCloseTo(2 * HALL_WALK + 30 + 12, 9);
  });

  it('без предпочтений стоимость пути равна времени в пути', () => {
    const result = findPath(tower(), 'f1_hall', 'f4_hall');

    expect(result.cost).toBeCloseTo(result.durationSeconds ?? Number.NaN, 9);
  });

  it('preferLift штрафует лестницу, но время того же пути не меняет', () => {
    const graph = tower();
    const plain = findPath(graph, 'f1_hall', 'f2_hall', { allowLift: false });
    const preferring = findPath(graph, 'f1_hall', 'f2_hall', { allowLift: false, preferLift: true });

    // Раньше навигатор делил стоимость на скорость, и время маршрута менялось
    // от галочки «предпочитать лифт», хотя путь оставался тем же.
    expect(preferring.path).toEqual(plain.path);
    expect(preferring.durationSeconds).toBeCloseTo(plain.durationSeconds ?? Number.NaN, 9);
    expect(preferring.cost).toBeGreaterThan(plain.cost);
  });

  it('preferLift выбирает лифт там, где лестница быстрее', () => {
    // На один этаж лестница — 20 с подъёма, лифт — 34 с с ожиданием.
    const graph = tower();

    expect(findPath(graph, 'f1_hall', 'f2_hall').path).toContain('f2_stairs');
    expect(findPath(graph, 'f1_hall', 'f2_hall', { preferLift: true }).path).toContain('f2_lift');
  });

  it('длина пути считается по плану: подъём на лифте её не увеличивает', () => {
    const result = findPath(tower(), 'f1_hall', 'f4_hall');

    expect(result.distanceMeters).toBeCloseTo(10, 9);
  });

  it('сумма стоимостей шагов равна стоимости пути и с посадкой в лифт', () => {
    const result = findPath(tower(), 'f1_hall', 'f4_hall', { preferLift: true });

    expect(result.found).toBe(true);
    expect(Math.abs(segmentsSum(result.segments) - result.cost)).toBeLessThan(1e-9);
  });
});

describe('findAlternativePaths', () => {
  it('возвращает основной путь и альтернативы', async () => {
    const graph = Graph.fromDataset(await sampleDataset());
    const result = findAlternativePaths(graph, 'campus_gate', 'a3_conference', {}, 3);

    expect(result.primary.found).toBe(true);
    // Синтетический кампус — дерево: независимых объездов нет.
    expect(result.alternatives).toEqual([]);
  });

  it('maxPaths меньше двух — альтернатив не ищет', async () => {
    const graph = Graph.fromDataset(await sampleDataset());

    expect(findAlternativePaths(graph, 'campus_gate', 'a3_conference', {}, 1).alternatives).toEqual([]);
  });

  it('результат детерминирован', async () => {
    const graph = Graph.fromDataset(await sampleDataset());

    const first = findAlternativePaths(graph, 'campus_gate', 'b1_library', {}, 3);
    const second = findAlternativePaths(graph, 'campus_gate', 'b1_library', {}, 3);

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
