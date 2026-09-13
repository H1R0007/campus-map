import { describe, expect, it } from 'vitest';
import { Graph, findConnectedComponents } from '../src/index.js';
import type { MapNode } from '../src/index.js';
import { sampleDataset } from './helpers/sampleDataset.js';

function node(id: string, neighbors: string[] = []): MapNode {
  return { id, x: 0, y: 0, building: 'b', floor: 1, neighbors, isPortal: false };
}

/**
 * Компоненты связности.
 *
 * Редактор показывает их в панели статистики и диагностики, поэтому важно
 * проверить не только «граф связен», но и разбор на несколько компонент и
 * определение изолированных узлов.
 */
describe('findConnectedComponents', () => {
  it('датасет из корпусов и этажей связен целиком', async () => {
    const graph = Graph.fromDataset(await sampleDataset());
    const result = findConnectedComponents(graph);

    expect(result.connected).toBe(true);
    expect(result.components).toHaveLength(1);
    expect(result.isolatedNodeIds).toEqual([]);
    expect(result.components[0]).toHaveLength(graph.nodeCount);
  });

  it('разбирает граф на компоненты и находит изолированные узлы', () => {
    // Основная компонента a-b-c, отдельный остров d-e и одиночный f.
    const graph = new Graph(
      [
        node('a', ['b']),
        node('b', ['a', 'c']),
        node('c', ['b']),
        node('d', ['e']),
        node('e', ['d']),
        node('f', []),
      ],
      []
    );

    const result = findConnectedComponents(graph);

    expect(result.connected).toBe(false);
    expect(result.components).toHaveLength(3);
    // Основная компонента — самая крупная, остальные считаются изолированными.
    expect(result.isolatedNodeIds.sort()).toEqual(['d', 'e', 'f']);
  });

  it('переход между этажами связывает компоненты', () => {
    const graph = new Graph(
      [node('a', []), { ...node('b', []), floor: 2 }],
      [{ fromNode: 'a', toNode: 'b', type: 'lift' }]
    );

    const result = findConnectedComponents(graph);

    expect(result.connected).toBe(true);
    expect(result.isolatedNodeIds).toEqual([]);
  });

  it('пустой граф считается связным', () => {
    const result = findConnectedComponents(new Graph([], []));

    expect(result.connected).toBe(true);
    expect(result.components).toEqual([]);
    expect(result.isolatedNodeIds).toEqual([]);
  });

  it('обходит граф за линейное время по числу рёбер', () => {
    // Цепочка из 2000 узлов: прежняя реализация в редакторе для каждого узла
    // перебирала весь массив переходов и на таком объёме уже заметна.
    const nodes: MapNode[] = [];
    for (let i = 0; i < 2000; i += 1) {
      nodes.push(node(`n${i}`, i + 1 < 2000 ? [`n${i + 1}`] : []));
    }

    const result = findConnectedComponents(new Graph(nodes, []));

    expect(result.connected).toBe(true);
    expect(result.components[0]).toHaveLength(2000);
  });
});
