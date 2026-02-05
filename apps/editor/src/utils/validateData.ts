import type { MapNode, Transition, BuildingMeta } from '@campus-map/core';

export type ValidationResult = {
  errors: string[];
  warnings: string[];
};

export function validateDataset(params: {
  nodes: Map<string, MapNode>;
  transitions: Transition[];
  buildingMetas: Map<string, BuildingMeta>;
}): ValidationResult {
  const { nodes, transitions, buildingMetas } = params;

  const errors: string[] = [];
  const warnings: string[] = [];

  const hasNode = (id: string) => nodes.has(id);

  // neighbors -> exist
  for (const [id, node] of nodes) {
    for (const nb of node.neighbors) {
      if (!hasNode(nb)) {
        errors.push(`Node "${id}" has neighbor "${nb}", but neighbor does not exist`);
      }
    }
  }

  // symmetry warnings
  for (const [id, node] of nodes) {
    for (const nb of node.neighbors) {
      const b = nodes.get(nb);
      if (!b) continue;
      if (!b.neighbors.includes(id)) {
        warnings.push(`Edge is not symmetric: "${id}" -> "${nb}" exists, but "${nb}" -> "${id}" is missing`);
      }
    }
  }

  // transitions -> exist
  for (const t of transitions) {
    if (!hasNode(t.fromNode)) errors.push(`Transition refers to missing fromNode "${t.fromNode}"`);
    if (!hasNode(t.toNode)) errors.push(`Transition refers to missing toNode "${t.toNode}"`);
  }

  // building/floor validity
  for (const [id, node] of nodes) {
    if (node.building === 'CAMPUS') {
      if (node.floor !== 0) warnings.push(`Campus node "${id}" has floor=${node.floor} (expected 0)`);
      continue;
    }

    const bm = buildingMetas.get(node.building);
    if (!bm) {
      errors.push(`Node "${id}" refers to unknown building "${node.building}"`);
      continue;
    }

    const okFloor = bm.floors.some((f) => f.floor === node.floor);
    if (!okFloor) {
      errors.push(`Node "${id}" refers to floor=${node.floor}, but building "${node.building}" has no such floor in meta.json`);
    }
  }

  return { errors, warnings };
}