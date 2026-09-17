import { CAMPUS_BUILDING_ID } from '@campus-map/core';
import type { EditorSlice } from './types';

export interface DisplayFilters {
  showPortals: boolean;
  showEdges: boolean;
  showTransitions: boolean;
  highlightOrphans: boolean;
  highlightNoAlias: boolean;
  highlightErrors: boolean;
  showAliasLabels: boolean;
}

export interface GridSettings {
  enabled: boolean;
  size: number;
  snap: boolean;
  visible: boolean;
}

/** Просьба к карте показать точку плана; карта выполняет её и сбрасывает. */
export interface CameraRequest {
  x: number;
  y: number;
  zoom?: number;
}

/**
 * Что показывает карта: какой план открыт, куда смотрит камера, какие слои
 * видны и как работает сетка.
 */
export interface ViewSlice {
  /** Открытый корпус; `null` — территория кампуса. */
  currentBuilding: string | null;
  currentFloor: number | null;
  cameraCenterRequest: CameraRequest | null;
  displayFilters: DisplayFilters;
  gridSettings: GridSettings;

  setCurrentBuilding: (buildingId: string | null) => void;
  setCurrentFloor: (floor: number | null) => void;
  setCameraCenter: (x: number, y: number, zoom?: number) => void;
  clearCameraCenter: () => void;
  /** Открывает план узла, ставит его в центр и выделяет. */
  centerOnNode: (nodeId: string, keepZoom?: boolean) => void;
  /** Открывает план узла, не трогая камеру и выделение. */
  navigateToNode: (nodeId: string) => void;
  setDisplayFilters: (filters: Partial<DisplayFilters>) => void;
  setGridSettings: (settings: Partial<GridSettings>) => void;
  snapToGrid: (value: number) => number;
}

export const createViewSlice: EditorSlice<ViewSlice> = (set, get) => ({
  currentBuilding: null,
  currentFloor: null,
  cameraCenterRequest: null,

  displayFilters: {
    showPortals: true,
    showEdges: true,
    showTransitions: true,
    highlightOrphans: false,
    highlightNoAlias: false,
    highlightErrors: false,
    showAliasLabels: false,
  },

  gridSettings: {
    enabled: false,
    size: 20,
    snap: true,
    visible: true,
  },

  setCurrentBuilding: (buildingId) =>
    set((state) => {
      state.currentBuilding = buildingId;
      if (buildingId) {
        const meta = state.buildingMetas.get(buildingId);
        state.currentFloor = meta?.floors[0]?.floor ?? 1;
      } else {
        state.currentFloor = null;
      }
      state.selectedNodeIds = new Set();
      state.edgeStartNodeId = null;
      state.transitionStartNodeId = null;
      state.lineTool.start = null;
      state.lineTool.end = null;
      state.selectionBox = null;
    }),

  setCurrentFloor: (floor) =>
    set((state) => {
      state.currentFloor = floor;
      state.selectedNodeIds = new Set();
      state.edgeStartNodeId = null;
      state.transitionStartNodeId = null;
      state.lineTool.start = null;
      state.lineTool.end = null;
      state.selectionBox = null;
    }),

  setCameraCenter: (x, y, zoom) =>
    set((s) => {
      s.cameraCenterRequest = { x, y, zoom };
    }),

  clearCameraCenter: () =>
    set((s) => {
      s.cameraCenterRequest = null;
    }),

  centerOnNode: (nodeId, keepZoom = true) => {
    const node = get().nodes.get(nodeId);
    if (!node) return;

    get().navigateToNode(nodeId);

    setTimeout(() => {
      set((s) => {
        s.cameraCenterRequest = {
          x: node.x,
          y: node.y,
          zoom: keepZoom ? undefined : 2,
        };
        s.selectedNodeIds = new Set([nodeId]);
      });
    }, 100);
  },

  navigateToNode: (nodeId) => {
    const node = get().nodes.get(nodeId);
    if (!node) return;

    const { currentBuilding, currentFloor } = get();

    if (node.building === CAMPUS_BUILDING_ID) {
      if (currentBuilding !== null) {
        set((s) => {
          s.currentBuilding = null;
          s.currentFloor = null;
        });
      }
    } else if (currentBuilding !== node.building || currentFloor !== node.floor) {
      set((s) => {
        s.currentBuilding = node.building;
        s.currentFloor = node.floor;
      });
    }
  },

  setDisplayFilters: (filters) =>
    set((s) => {
      Object.assign(s.displayFilters, filters);
    }),

  setGridSettings: (settings) =>
    set((s) => {
      Object.assign(s.gridSettings, settings);
    }),

  snapToGrid: (value) => {
    const { gridSettings } = get();
    if (!gridSettings.enabled || !gridSettings.snap) return Math.round(value);
    const size = gridSettings.size;
    return Math.round(value / size) * size;
  },
});
