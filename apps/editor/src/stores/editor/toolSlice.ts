import type { TransitionType } from '@campus-map/core';
import type { EditorSlice } from './types';

export type EditorTool = 'select' | 'node' | 'edge' | 'transition' | 'line';

export interface LinePoint {
  x: number;
  y: number;
}

export interface LineToolState {
  start: LinePoint | null;
  end: LinePoint | null;
  count: number;
  autoConnect: boolean;
}

/**
 * Выбранный инструмент и то, что он успел начать: первый узел ребра или
 * перехода, точки линии.
 */
export interface ToolSlice {
  activeTool: EditorTool;
  /**
   * Выбранный вид точки — «кисть» инструмента «Узел»: щелчки по карте ставят
   * точки этого вида подряд. Хранится по id: каталог видов правится, и
   * ссылка на исчезнувший вид просто перестаёт быть выбранной.
   */
  activeKindId: string;
  /**
   * Последняя точка начатой линии: следующая точка ведущего вида
   * соединится с ней. `null` — линия не начата.
   */
  chainLastNodeId: string | null;
  transitionType: TransitionType;
  edgeStartNodeId: string | null;
  transitionStartNodeId: string | null;
  lineTool: LineToolState;

  setActiveTool: (tool: EditorTool) => void;
  setActiveKind: (kindId: string) => void;
  /** Закончить начатую линию: следующая точка начнёт новую. */
  endChain: () => void;
  setTransitionType: (type: TransitionType) => void;
  setEdgeStartNode: (nodeId: string | null) => void;
  setTransitionStartNode: (nodeId: string | null) => void;

  lineReset: () => void;
  lineSetStart: (x: number, y: number) => void;
  lineSetEnd: (x: number, y: number) => void;
  lineSetCount: (count: number) => void;
  lineSetAutoConnect: (v: boolean) => void;
}

export const createToolSlice: EditorSlice<ToolSlice> = (set) => ({
  activeTool: 'select',
  activeKindId: 'room',
  chainLastNodeId: null,
  transitionType: 'entrance',
  edgeStartNodeId: null,
  transitionStartNodeId: null,

  lineTool: {
    start: null,
    end: null,
    count: 8,
    autoConnect: true,
  },

  setActiveKind: (kindId) =>
    set((s) => {
      s.activeKindId = kindId;
      // Смена вида заканчивает начатую линию: коридор не должен цепляться к
      // двери, поставленной другой кистью.
      s.chainLastNodeId = null;
    }),

  endChain: () =>
    set((s) => {
      s.chainLastNodeId = null;
    }),

  setActiveTool: (tool) =>
    set((state) => {
      state.activeTool = tool;
      state.edgeStartNodeId = null;
      state.transitionStartNodeId = null;
      state.chainLastNodeId = null;
      if (tool !== 'line') {
        state.lineTool.start = null;
        state.lineTool.end = null;
      }
    }),

  setTransitionType: (type) =>
    set((s) => {
      s.transitionType = type;
    }),

  setEdgeStartNode: (nodeId) =>
    set((s) => {
      s.edgeStartNodeId = nodeId;
    }),

  setTransitionStartNode: (nodeId) =>
    set((s) => {
      s.transitionStartNodeId = nodeId;
    }),

  lineReset: () =>
    set((s) => {
      s.lineTool.start = null;
      s.lineTool.end = null;
    }),

  lineSetStart: (x, y) =>
    set((s) => {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      const { gridSettings } = s;
      let finalX = Math.round(x);
      let finalY = Math.round(y);
      if (gridSettings.enabled && gridSettings.snap) {
        finalX = Math.round(x / gridSettings.size) * gridSettings.size;
        finalY = Math.round(y / gridSettings.size) * gridSettings.size;
      }
      s.lineTool.start = { x: finalX, y: finalY };
      s.lineTool.end = null;
    }),

  lineSetEnd: (x, y) =>
    set((s) => {
      if (!s.lineTool.start) return;
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      const { gridSettings } = s;
      let finalX = Math.round(x);
      let finalY = Math.round(y);
      if (gridSettings.enabled && gridSettings.snap) {
        finalX = Math.round(x / gridSettings.size) * gridSettings.size;
        finalY = Math.round(y / gridSettings.size) * gridSettings.size;
      }
      s.lineTool.end = { x: finalX, y: finalY };
    }),

  lineSetCount: (count) =>
    set((s) => {
      if (!Number.isFinite(count)) return;
      s.lineTool.count = Math.max(2, Math.min(50, Math.floor(count)));
    }),

  lineSetAutoConnect: (v) =>
    set((s) => {
      s.lineTool.autoConnect = Boolean(v);
    }),
});
