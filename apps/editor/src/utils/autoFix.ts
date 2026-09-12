import type { MapNode, Transition } from '@campus-map/core';

export type AutoFixReport = {
  // Соседи
  removedMissingNeighbors: number;
  removedSelfReferences: number;
  removedDuplicateNeighbors: number;
  addedSymmetricEdges: number;

  // Переходы
  removedInvalidTransitions: number;
  removedDuplicateTransitions: number;
  removedSelfTransitions: number;

  // Узлы
  removedOrphanNodes: number;
  fixedNodeCoordinates: number;

  // Общее
  totalFixes: number;
};

export interface AutoFixOptions {
  /** Удалять узлы без связей */
  removeOrphans?: boolean;
  /** Исправлять некорректные координаты (NaN, Infinity) */
  fixCoordinates?: boolean;
  /** Удалять дубликаты соседей */
  removeDuplicateNeighbors?: boolean;
  /** Добавлять симметричные рёбра */
  addSymmetricEdges?: boolean;
  /** Удалять ссылки на несуществующих соседей */
  removeMissingNeighbors?: boolean;
  /** Удалять self-references */
  removeSelfReferences?: boolean;
  /** Исправлять transitions */
  fixTransitions?: boolean;
}

const DEFAULT_OPTIONS: Required<AutoFixOptions> = {
  removeOrphans: false, // Опасная операция — выключена по умолчанию
  fixCoordinates: true,
  removeDuplicateNeighbors: true,
  addSymmetricEdges: true,
  removeMissingNeighbors: true,
  removeSelfReferences: true,
  fixTransitions: true,
};

export function autoFixDataset(params: {
  nodes: Map<string, MapNode>;
  transitions: Transition[];
  options?: AutoFixOptions;
}): {
  fixedNodesNeighbors: Map<string, string[]>;
  fixedTransitions: Transition[];
  removedNodeIds: string[];
  report: AutoFixReport;
} {
  const { nodes, transitions, options: userOptions } = params;
  const options = { ...DEFAULT_OPTIONS, ...userOptions };

  const report: AutoFixReport = {
    removedMissingNeighbors: 0,
    removedSelfReferences: 0,
    removedDuplicateNeighbors: 0,
    addedSymmetricEdges: 0,
    removedInvalidTransitions: 0,
    removedDuplicateTransitions: 0,
    removedSelfTransitions: 0,
    removedOrphanNodes: 0,
    fixedNodeCoordinates: 0,
    totalFixes: 0,
  };

  const removedNodeIds: string[] = [];
  const newNeighbors = new Map<string, string[]>();

  // === ЭТАП 1: Исправляем координаты ===
  if (options.fixCoordinates) {
    for (const node of nodes.values()) {
      let fixed = false;
      let x = node.x;
      let y = node.y;

      if (!Number.isFinite(x)) {
        x = 0;
        fixed = true;
      }
      if (!Number.isFinite(y)) {
        y = 0;
        fixed = true;
      }

      if (fixed) {
        node.x = x;
        node.y = y;
        report.fixedNodeCoordinates++;
      }
    }
  }

  // === ЭТАП 2: Исправляем neighbors ===
  for (const [id, node] of nodes) {
    const seen = new Set<string>();
    const filtered: string[] = [];

    for (const nb of node.neighbors) {
      // Self-reference
      if (nb === id) {
        if (options.removeSelfReferences) {
          report.removedSelfReferences++;
          continue;
        }
      }

      // Missing neighbor
      if (!nodes.has(nb)) {
        if (options.removeMissingNeighbors) {
          report.removedMissingNeighbors++;
          continue;
        }
      }

      // Duplicate
      if (seen.has(nb)) {
        if (options.removeDuplicateNeighbors) {
          report.removedDuplicateNeighbors++;
          continue;
        }
      }

      seen.add(nb);
      filtered.push(nb);
    }

    newNeighbors.set(id, filtered);
  }

  // === ЭТАП 3: Добавляем симметричные рёбра ===
  if (options.addSymmetricEdges) {
    for (const [id, neighbors] of newNeighbors) {
      for (const nb of neighbors) {
        const otherNeighbors = newNeighbors.get(nb);
        if (otherNeighbors && !otherNeighbors.includes(id)) {
          otherNeighbors.push(id);
          report.addedSymmetricEdges++;
        }
      }
    }
  }

  // === ЭТАП 4: Исправляем transitions ===
  let fixedTransitions = [...transitions];

  if (options.fixTransitions) {
    const seenTransitions = new Set<string>();
    const validTransitions: Transition[] = [];

    for (const t of fixedTransitions) {
      // Self-transition
      if (t.fromNode === t.toNode) {
        report.removedSelfTransitions++;
        continue;
      }

      // Invalid nodes
      if (!nodes.has(t.fromNode) || !nodes.has(t.toNode)) {
        report.removedInvalidTransitions++;
        continue;
      }

      // Duplicate
      const key = [t.fromNode, t.toNode].sort().join('|') + `|${t.type}`;
      if (seenTransitions.has(key)) {
        report.removedDuplicateTransitions++;
        continue;
      }

      seenTransitions.add(key);
      validTransitions.push(t);
    }

    fixedTransitions = validTransitions;
  }

  // === ЭТАП 5: Удаляем orphan nodes (опционально) ===
  if (options.removeOrphans) {
    for (const [id, neighbors] of newNeighbors) {
      const hasNeighbors = neighbors.length > 0;
      const hasTransitions = fixedTransitions.some(t => t.fromNode === id || t.toNode === id);

      if (!hasNeighbors && !hasTransitions) {
        removedNodeIds.push(id);
        newNeighbors.delete(id);
        report.removedOrphanNodes++;
      }
    }

    // Обновляем neighbors после удаления orphans
    for (const [id, neighbors] of newNeighbors) {
      const filtered = neighbors.filter(nb => !removedNodeIds.includes(nb));
      newNeighbors.set(id, filtered);
    }

    // Обновляем transitions
    fixedTransitions = fixedTransitions.filter(
      t => !removedNodeIds.includes(t.fromNode) && !removedNodeIds.includes(t.toNode)
    );
  }

  // === Считаем общее количество исправлений ===
  report.totalFixes =
    report.removedMissingNeighbors +
    report.removedSelfReferences +
    report.removedDuplicateNeighbors +
    report.addedSymmetricEdges +
    report.removedInvalidTransitions +
    report.removedDuplicateTransitions +
    report.removedSelfTransitions +
    report.removedOrphanNodes +
    report.fixedNodeCoordinates;

  return {
    fixedNodesNeighbors: newNeighbors,
    fixedTransitions,
    removedNodeIds,
    report,
  };
}

/**
 * Проверка данных без изменений
 */
export function diagnoseDataset(params: {
  nodes: Map<string, MapNode>;
  transitions: Transition[];
}): {
  issues: string[];
  warnings: string[];
  stats: {
    orphanNodes: number;
    missingNeighbors: number;
    asymmetricEdges: number;
    invalidTransitions: number;
    duplicateTransitions: number;
  };
} {
  const { nodes, transitions } = params;
  const issues: string[] = [];
  const warnings: string[] = [];

  let orphanNodes = 0;
  let missingNeighbors = 0;
  let asymmetricEdges = 0;
  let invalidTransitions = 0;
  let duplicateTransitions = 0;

  // Проверяем узлы
  for (const [id, node] of nodes) {
    // Orphan check
    const hasNeighbors = node.neighbors.length > 0;
    const hasTransitions = transitions.some(t => t.fromNode === id || t.toNode === id);
    if (!hasNeighbors && !hasTransitions) {
      orphanNodes++;
      warnings.push(`Узел "${id}" не имеет связей`);
    }

    // Missing neighbors
    for (const nb of node.neighbors) {
      if (!nodes.has(nb)) {
        missingNeighbors++;
        issues.push(`Узел "${id}" ссылается на несуществующего соседа "${nb}"`);
      }
    }

    // Asymmetric edges
    for (const nb of node.neighbors) {
      const neighbor = nodes.get(nb);
      if (neighbor && !neighbor.neighbors.includes(id)) {
        asymmetricEdges++;
        warnings.push(`Асимметричное ребро: "${id}" → "${nb}" (обратное отсутствует)`);
      }
    }

    // Invalid coordinates
    if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) {
      issues.push(`Узел "${id}" имеет некорректные координаты`);
    }
  }

  // Проверяем transitions
  const seenTransitions = new Set<string>();
  for (const t of transitions) {
    if (!nodes.has(t.fromNode)) {
      invalidTransitions++;
      issues.push(`Переход ссылается на несуществующий узел "${t.fromNode}"`);
    }
    if (!nodes.has(t.toNode)) {
      invalidTransitions++;
      issues.push(`Переход ссылается на несуществующий узел "${t.toNode}"`);
    }

    const key = [t.fromNode, t.toNode].sort().join('|');
    if (seenTransitions.has(key)) {
      duplicateTransitions++;
      warnings.push(`Дублирующийся переход между "${t.fromNode}" и "${t.toNode}"`);
    }
    seenTransitions.add(key);
  }

  return {
    issues,
    warnings,
    stats: {
      orphanNodes,
      missingNeighbors,
      asymmetricEdges,
      invalidTransitions,
      duplicateTransitions,
    },
  };
}
