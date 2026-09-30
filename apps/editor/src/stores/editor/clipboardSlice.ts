import type { MapNode } from '@campus-map/core';
import { useHistoryStore } from '../historyStore';
import { nodesCount } from '../../utils/labels';
import type { EditorSlice } from './types';
import { idMinter, openPlanOf } from './placement';

/** Сдвиг вставки на том же плане, пиксели: копия не ложится точно на оригинал. */
const PASTE_OFFSET = 20;

export interface ClipboardData {
  nodes: MapNode[];
  internalEdges: { from: string; to: string }[];
}

/** Буфер обмена: копировать, вставить на открытый план, дублировать. */
export interface ClipboardSlice {
  clipboard: ClipboardData | null;
  duplicateSelected: () => void;
  copySelected: () => void;
  /** Вставляет копию на открытый план; без сдвига — на своё место или рядом. */
  paste: (offsetX?: number, offsetY?: number) => void;
}

export const createClipboardSlice: EditorSlice<ClipboardSlice> = (set, get) => ({
  clipboard: null,

  duplicateSelected: () => {
    const { selectedNodeIds, nodes } = get();
    if (selectedNodeIds.size === 0) return;

    const ids = Array.from(selectedNodeIds);
    const offset = 30;

    const oldToNew = new Map<string, string>();
    const newNodes: MapNode[] = [];

    const mint = idMinter(nodes);

    for (const id of ids) {
      const node = nodes.get(id);
      if (!node) continue;

      const newId = mint(node, node);
      oldToNew.set(id, newId);

      newNodes.push({
        id: newId,
        x: node.x + offset,
        y: node.y + offset,
        building: node.building,
        floor: node.floor,
        // Переходы не копируются, поэтому и точкой перехода копия не будет.
        isPortal: false,
        neighbors: [],
      });
    }

    for (const id of ids) {
      const node = nodes.get(id);
      if (!node) continue;
      const newNode = newNodes.find((n) => n.id === oldToNew.get(id))!;
      for (const nb of node.neighbors) {
        const mapped = oldToNew.get(nb);
        if (mapped) newNode.neighbors.push(mapped);
      }
    }

    useHistoryStore.getState().push({
      type: 'BATCH',
      description: `Дублировано: ${nodesCount(newNodes.length)}`,
      undoData: { kind: 'line', nodeIds: newNodes.map((n) => n.id) },
      redoData: { kind: 'line', nodes: newNodes },
    });

    set((s) => {
      for (const n of newNodes) {
        s.nodes.set(n.id, { ...n, neighbors: [...n.neighbors] });
      }
      s.selectedNodeIds = new Set(newNodes.map((n) => n.id));
    });
  },

  copySelected: () => {
    const { selectedNodeIds, nodes } = get();
    if (selectedNodeIds.size === 0) return;

    const ids = Array.from(selectedNodeIds);
    const copiedNodes: MapNode[] = [];
    const internalEdges: { from: string; to: string }[] = [];

    for (const id of ids) {
      const node = nodes.get(id);
      if (!node) continue;
      copiedNodes.push({ ...node, neighbors: [...node.neighbors] });
      for (const nb of node.neighbors) {
        if (ids.includes(nb) && id < nb) internalEdges.push({ from: id, to: nb });
      }
    }

    set((s) => {
      s.clipboard = { nodes: copiedNodes, internalEdges };
    });
  },

  /**
   * Вставляет скопированное на открытый план.
   *
   * Без явного сдвига копия ложится: на том же плане — рядом с оригиналом,
   * на другом — в те же координаты, чтобы переносить коридор с этажа на этаж.
   * Прежде узлы получали id открытого плана, но оставались в корпусе и на
   * этаже оригинала: на кампусе вставленного было не найти.
   */
  paste: (offsetX, offsetY) => {
    const st = get();
    const { clipboard } = st;
    if (!clipboard || clipboard.nodes.length === 0) return;

    const { building, floor } = openPlanOf(st);
    const samePlan = clipboard.nodes.every((n) => n.building === building && n.floor === floor);
    const shiftX = offsetX ?? (samePlan ? PASTE_OFFSET : 0);
    const shiftY = offsetY ?? (samePlan ? PASTE_OFFSET : 0);

    const oldToNew = new Map<string, string>();
    const newNodes: MapNode[] = [];

    const mint = idMinter(get().nodes);

    for (const node of clipboard.nodes) {
      const newId = mint(node, { building, floor });
      oldToNew.set(node.id, newId);

      newNodes.push({
        id: newId,
        x: node.x + shiftX,
        y: node.y + shiftY,
        building,
        floor,
        // Переходы не копируются, поэтому и точкой перехода копия не будет.
        isPortal: false,
        neighbors: [],
      });
    }

    for (const edge of clipboard.internalEdges) {
      const newFrom = oldToNew.get(edge.from);
      const newTo = oldToNew.get(edge.to);
      if (newFrom && newTo) {
        newNodes.find((n) => n.id === newFrom)!.neighbors.push(newTo);
        newNodes.find((n) => n.id === newTo)!.neighbors.push(newFrom);
      }
    }

    useHistoryStore.getState().push({
      type: 'BATCH',
      description: `Вставлено: ${nodesCount(newNodes.length)}`,
      undoData: { kind: 'line', nodeIds: newNodes.map((n) => n.id) },
      redoData: { kind: 'line', nodes: newNodes },
    });

    set((s) => {
      for (const n of newNodes) {
        s.nodes.set(n.id, { ...n, neighbors: [...n.neighbors] });
      }
      s.selectedNodeIds = new Set(newNodes.map((n) => n.id));
    });
  },
});
