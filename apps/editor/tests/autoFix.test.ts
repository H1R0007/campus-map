import { describe, expect, it } from 'vitest';
import type { MapNode, Transition } from '@campus-map/core';
import { autoFixDataset } from '../src/utils/autoFix';
import { fixtureDataset } from './helpers/fixture';

function params() {
  const dataset = fixtureDataset();
  return {
    nodes: new Map<string, MapNode>(dataset.nodes.map((n) => [n.id, { ...n, neighbors: [...n.neighbors] }])),
    transitions: dataset.transitions.map((t): Transition => ({ ...t })),
  };
}

describe('autoFixDataset', () => {
  it('исправные данные не меняет', () => {
    const p = params();
    const { fixedNodesNeighbors, fixedTransitions, report } = autoFixDataset(p);
    expect(report.totalFixes).toBe(0);
    expect(fixedTransitions).toEqual(p.transitions);
    for (const [id, neighbors] of fixedNodesNeighbors) {
      expect(neighbors).toEqual(p.nodes.get(id)!.neighbors);
    }
  });

  it('убирает висячих соседей, петли и повторы', () => {
    const p = params();
    p.nodes.get('a1_hall')!.neighbors.push('ghost', 'a1_hall', 'a1_stairs');
    const { fixedNodesNeighbors, report } = autoFixDataset(p);
    expect(fixedNodesNeighbors.get('a1_hall')).toEqual(['a1_entrance', 'a1_stairs', 'a1_room101']);
    expect(report.removedMissingNeighbors).toBe(1);
    expect(report.removedSelfReferences).toBe(1);
    expect(report.removedDuplicateNeighbors).toBe(1);
  });

  it('достраивает обратное ребро', () => {
    const p = params();
    p.nodes.get('a2_room201')!.neighbors.push('a2_stairs');
    const { fixedNodesNeighbors, report } = autoFixDataset(p);
    expect(fixedNodesNeighbors.get('a2_stairs')).toContain('a2_room201');
    expect(report.addedSymmetricEdges).toBe(1);
  });

  it('убирает переходы к несуществующим узлам, на себя и повторы', () => {
    const p = params();
    p.transitions.push(
      { fromNode: 'a1_stairs', toNode: 'ghost', type: 'stairs' },
      { fromNode: 'a1_hall', toNode: 'a1_hall', type: 'lift' },
      { fromNode: 'a2_stairs', toNode: 'a1_stairs', type: 'stairs' }
    );
    const { fixedTransitions, report } = autoFixDataset(p);
    expect(fixedTransitions).toEqual(params().transitions);
    expect(report.removedInvalidTransitions).toBe(1);
    expect(report.removedSelfTransitions).toBe(1);
    expect(report.removedDuplicateTransitions).toBe(1);
  });

  it('узлы без связей по умолчанию не удаляет', () => {
    const p = params();
    p.nodes.set('lonely', { id: 'lonely', building: 'building_a', floor: 1, x: 0, y: 0, isPortal: false, neighbors: [] });
    const { removedNodeIds } = autoFixDataset(p);
    expect(removedNodeIds).toEqual([]);
  });
});
