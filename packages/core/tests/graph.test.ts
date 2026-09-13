import { describe, expect, it } from 'vitest';
import { Graph, createCampusProjection } from '../src/index.js';
import type { BuildingMeta, CampusMeta, MapNode, Transition } from '../src/index.js';
import { sampleDataset } from './helpers/sampleDataset.js';

function node(id: string, building: string, floor: number, neighbors: string[] = []): MapNode {
  return { id, x: 0, y: 0, building, floor, neighbors, isPortal: false };
}

/**
 * Индексы графа.
 *
 * Граф неизменяемый и строит индексы один раз в конструкторе, поэтому
 * типовые операции должны быть O(1). Здесь проверяется содержимое индексов,
 * а не скорость: корректность важнее, а асимптотика обеспечена конструкцией.
 */
describe('Graph', () => {
  it('строится из датасета', async () => {
    const dataset = await sampleDataset();
    const graph = Graph.fromDataset(dataset);

    expect(graph.nodeCount).toBe(dataset.nodes.length);
    expect(graph.transitionCount).toBe(4);
  });

  it('индексирует узлы по корпусу и этажу', async () => {
    const graph = Graph.fromDataset(await sampleDataset());

    expect(graph.getNodesForFloor('building_a', 1).length).toBe(6);
    expect(graph.getCampusNodes().length).toBe(4);
    expect(graph.getNodesForFloor('building_a', 99)).toEqual([]);
    expect(graph.getNodesForFloor('no_such_building', 1)).toEqual([]);
  });

  it('возвращает узел по id и сообщает об отсутствии', async () => {
    const graph = Graph.fromDataset(await sampleDataset());

    expect(graph.getNode('a1_lobby')?.id).toBe('a1_lobby');
    expect(graph.hasNode('a1_lobby')).toBe(true);
    expect(graph.getNode('nope')).toBeUndefined();
    expect(graph.hasNode('nope')).toBe(false);
    expect(graph.getNeighbors('nope')).toEqual([]);
  });

  it('тип перехода не зависит от порядка аргументов', async () => {
    const graph = Graph.fromDataset(await sampleDataset());

    expect(graph.getTransitionType('a1_stairs', 'a2_stairs')).toBe('stairs');
    expect(graph.getTransitionType('a2_stairs', 'a1_stairs')).toBe('stairs');
  });

  it('для обычного ребра на этаже тип перехода равен null', async () => {
    const graph = Graph.fromDataset(await sampleDataset());

    expect(graph.getTransitionType('a1_lobby', 'a1_corridor')).toBeNull();
  });

  it('список смежности объединяет рёбра этажа и переходы', async () => {
    const graph = Graph.fromDataset(await sampleDataset());
    const neighbors = graph.getNeighbors('a1_stairs');

    expect(neighbors).toContain('a1_lobby');   // ребро на этаже
    expect(neighbors).toContain('a2_stairs');  // переход на другой этаж
  });

  it('список смежности не содержит несуществующих узлов', async () => {
    const graph = Graph.fromDataset(await sampleDataset());

    for (const n of graph.getAllNodes()) {
      for (const neighbor of graph.getNeighbors(n.id)) {
        expect(graph.hasNode(neighbor)).toBe(true);
      }
    }
  });

  it('отбрасывает висячие ссылки и дубликаты при построении смежности', () => {
    const graph = new Graph(
      [node('a', 'CAMPUS', 0, ['b', 'b', 'ghost']), node('b', 'CAMPUS', 0, ['a'])],
      []
    );

    expect(graph.getNeighbors('a')).toEqual(['b']);
  });

  it('переход связывает узлы в обе стороны даже без reciprocity в neighbors', () => {
    const transitions: Transition[] = [{ fromNode: 'a', toNode: 'b', type: 'lift' }];
    const graph = new Graph(
      [node('a', 'building_x', 1), node('b', 'building_x', 2)],
      transitions
    );

    expect(graph.getNeighbors('a')).toContain('b');
    expect(graph.getNeighbors('b')).toContain('a');
    expect(graph.transitionCount).toBe(1);
  });

  it('не считает дубликаты переходов дважды', () => {
    const graph = new Graph(
      [node('a', 'b1', 1), node('b', 'b1', 2)],
      [
        { fromNode: 'a', toNode: 'b', type: 'stairs' },
        { fromNode: 'b', toNode: 'a', type: 'stairs' },
      ]
    );

    expect(graph.transitionCount).toBe(1);
  });
});

/**
 * Мировые координаты узлов.
 *
 * Они живут в графе, а не в узле: пиксели узла редактор меняет
 * перетаскиванием, и копия мировых координат на узле устарела бы.
 */
describe('Graph: пространство кампуса', () => {
  const CAMPUS: CampusMeta = {
    buildings: [{ id: 'b1' }],
    mapSize: { width: 1, height: 1 },
    metersPerPixel: 1,
  };

  const B1: BuildingMeta = {
    id: 'b1',
    name: 'Корпус 1',
    placement: {
      metersPerPixel: 1,
      originMeters: { x: 0, y: 0 },
      rotationDeg: 0,
      baseElevationMeters: 0,
      floorHeightMeters: 3,
    },
    floors: [{ floor: 1 }, { floor: 2 }],
  };

  it('без привязки граф пиксельный и мировых координат не даёт', () => {
    const graph = new Graph([node('a', 'b1', 1)], []);

    expect(graph.isMetric).toBe(false);
    expect(graph.getWorld('a')).toBeUndefined();
  });

  it('датасет без привязки — пиксельный', async () => {
    expect(Graph.fromDataset(await sampleDataset()).isMetric).toBe(false);
  });

  it('из датасета с полной привязкой хранит точку каждого узла', () => {
    const graph = Graph.fromDataset({
      campusMeta: CAMPUS,
      buildingMetas: [B1],
      nodes: [{ ...node('a', 'b1', 2), x: 3, y: 4 }],
      transitions: [],
      aliases: [],
    });

    expect(graph.isMetric).toBe(true);
    expect(graph.getWorld('a')).toEqual({ x: 3, y: 4, z: 3 });
    expect(graph.getWorld('nope')).toBeUndefined();
  });

  it('узел этажа без привязки переводит в пиксельный режим весь граф', () => {
    // Этаж 9 не объявлен в метаданных корпуса. Оставить метрику остальным
    // узлам значило бы смешать метры и пиксели в одном маршруте.
    const graph = new Graph(
      [node('a', 'b1', 1), node('b', 'b1', 9)],
      [],
      createCampusProjection(CAMPUS, [B1])
    );

    expect(graph.isMetric).toBe(false);
    expect(graph.getWorld('a')).toBeUndefined();
  });
});
