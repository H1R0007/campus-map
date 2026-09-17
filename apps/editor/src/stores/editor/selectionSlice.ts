import type { EditorSlice } from './types';

/** Ребро или переход под курсором — пара концов. */
export interface NodePair {
  from: string;
  to: string;
}

/** Рамка выделения в координатах плана. */
export interface SelectionBoxState {
  active: boolean;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

/**
 * Выделенные узлы, наведение курсора и рамка выделения.
 */
export interface SelectionSlice {
  selectedNodeIds: Set<string>;
  hoveredNodeId: string | null;
  hoveredEdge: NodePair | null;
  hoveredTransition: NodePair | null;
  selectionBox: SelectionBoxState | null;
  inlineEditNodeId: string | null;

  toggleSelectNode: (nodeId: string, addToSelection?: boolean) => void;
  selectSingleNode: (nodeId: string) => void;
  clearSelection: () => void;
  addToSelection: (nodeIds: string[]) => void;
  removeFromSelection: (nodeIds: string[]) => void;
  selectNodesInRect: (x1: number, y1: number, x2: number, y2: number) => void;
  selectAll: () => void;

  setHoveredNode: (nodeId: string | null) => void;
  setHoveredEdge: (edge: NodePair | null) => void;
  setHoveredTransition: (t: NodePair | null) => void;

  startSelectionBox: (x: number, y: number) => void;
  updateSelectionBox: (x: number, y: number) => void;
  finishSelectionBox: () => void;
  cancelSelectionBox: () => void;

  setInlineEditNode: (nodeId: string | null) => void;
}

export const createSelectionSlice: EditorSlice<SelectionSlice> = (set, get) => ({
  selectedNodeIds: new Set(),
  hoveredNodeId: null,
  hoveredEdge: null,
  hoveredTransition: null,
  selectionBox: null,
  inlineEditNodeId: null,

  toggleSelectNode: (nodeId, addToSelection = false) =>
    set((state) => {
      if (!addToSelection && state.selectedNodeIds.size === 1 && state.selectedNodeIds.has(nodeId)) {
        state.selectedNodeIds = new Set();
        return;
      }
      if (addToSelection) {
        if (state.selectedNodeIds.has(nodeId)) {
          state.selectedNodeIds.delete(nodeId);
        } else {
          state.selectedNodeIds.add(nodeId);
        }
      } else {
        state.selectedNodeIds = new Set([nodeId]);
      }
    }),

  selectSingleNode: (nodeId) =>
    set((state) => {
      state.selectedNodeIds = new Set([nodeId]);
    }),

  clearSelection: () =>
    set((state) => {
      state.selectedNodeIds = new Set();
    }),

  addToSelection: (nodeIds) =>
    set((s) => {
      for (const id of nodeIds) {
        if (s.nodes.has(id)) s.selectedNodeIds.add(id);
      }
    }),

  removeFromSelection: (nodeIds) =>
    set((s) => {
      for (const id of nodeIds) s.selectedNodeIds.delete(id);
    }),

  selectNodesInRect: (x1, y1, x2, y2) => {
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);

    const inRect = get()
      .getNodesForCurrentFloor()
      .filter((n) => n.x >= minX && n.x <= maxX && n.y >= minY && n.y <= maxY);

    set((s) => {
      s.selectedNodeIds = new Set(inRect.map((n) => n.id));
    });
  },

  selectAll: () => {
    const floorNodes = get().getNodesForCurrentFloor();
    set((s) => {
      s.selectedNodeIds = new Set(floorNodes.map((n) => n.id));
    });
  },

  setHoveredNode: (nodeId) =>
    set((state) => {
      state.hoveredNodeId = nodeId;
    }),

  setHoveredEdge: (edge) =>
    set((state) => {
      state.hoveredEdge = edge;
    }),

  setHoveredTransition: (t) =>
    set((state) => {
      state.hoveredTransition = t;
    }),

  startSelectionBox: (x, y) =>
    set((s) => {
      s.selectionBox = { active: true, startX: x, startY: y, endX: x, endY: y };
    }),

  updateSelectionBox: (x, y) =>
    set((s) => {
      if (s.selectionBox) {
        s.selectionBox.endX = x;
        s.selectionBox.endY = y;
      }
    }),

  finishSelectionBox: () => {
    const { selectionBox } = get();
    if (selectionBox) {
      get().selectNodesInRect(selectionBox.startX, selectionBox.startY, selectionBox.endX, selectionBox.endY);
    }
    set((s) => {
      s.selectionBox = null;
    });
  },

  cancelSelectionBox: () =>
    set((s) => {
      s.selectionBox = null;
    }),

  setInlineEditNode: (nodeId) =>
    set((s) => {
      s.inlineEditNodeId = nodeId;
    }),
});
