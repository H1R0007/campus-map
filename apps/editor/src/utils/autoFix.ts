import type { MapNode, Transition } from '@campus-map/core';

export type AutoFixReport = {
  removedMissingNeighbors: number;
  addedSymmetricEdges: number;
  removedInvalidTransitions: number;
  removedDuplicateTransitions: number;
};

export function autoFixDataset(params: {
  nodes: Map<string, MapNode>;
  transitions: Transition[];
}): { fixedNodesNeighbors: Map<string, string[]>; fixedTransitions: Transition[]; report: AutoFixReport } {
  const { nodes, transitions } = params;

  let removedMissingNeighbors = 0;
  let addedSymmetricEdges = 0;
  let removedInvalidTransitions = 0;
  let removedDuplicateTransitions = 0;

  // 1) fix neighbors (remove missing, dedup)
  const newNeighbors = new Map<string, string[]>();

  for (const [id, node] of nodes) {
    const seen = new Set<string>();
    const filtered: string[] = [];
    for (const nb of node.neighbors) {
      if (!nodes.has(nb)) {
        removedMissingNeighbors++;
        continue;
      }
      if (nb === id) continue;
      if (seen.has(nb)) continue;
      seen.add(nb);
      filtered.push(nb);
    }
    newNeighbors.set(id, filtered);
  }

  // 2) symmetrize edges
  for (const [id, list] of newNeighbors) {
    for (const nb of list) {
      const other = newNeighbors.get(nb);
      if (!other) continue;
      if (!other.includes(id)) {
        other.push(id);
        addedSymmetricEdges++;
      }
    }
  }

  // 3) transitions: remove invalid + dedup
  const uniq = new Set<string>();
  const fixedTransitions: Transition[] = [];

  for (const t of transitions) {
    if (!nodes.has(t.fromNode) || !nodes.has(t.toNode) || t.fromNode === t.toNode) {
      removedInvalidTransitions++;
      continue;
    }
    const key = [t.fromNode, t.toNode].sort().join('|') + `|${t.type}`;
    if (uniq.has(key)) {
      removedDuplicateTransitions++;
      continue;
    }
    uniq.add(key);
    fixedTransitions.push(t);
  }

  return {
    fixedNodesNeighbors: newNeighbors,
    fixedTransitions,
    report: {
      removedMissingNeighbors,
      addedSymmetricEdges,
      removedInvalidTransitions,
      removedDuplicateTransitions,
    },
  };
}