import { CAMPUS_BUILDING_ID } from '@campus-map/core';
import type { BuildingMeta } from '@campus-map/core';
import type { EditorSlice } from './types';

/**
 * Этаж, который открывается при выборе корпуса: этаж входа из данных, без
 * него — нижний надземный, как в навигаторе. Первый этаж списка в
 * `meta.json` для этого не годится: подвал в списке часто идёт первым.
 */
export function openingFloorOf(meta: BuildingMeta | undefined): number | null {
  if (!meta || meta.floors.length === 0) return null;
  if (meta.entranceFloor !== undefined) return meta.entranceFloor;

  const floors = meta.floors.map((floor) => floor.floor).sort((a, b) => a - b);
  return floors.find((floor) => floor >= 1) ?? floors[floors.length - 1];
}

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
  /**
   * Выравнивать новую точку по соседним точкам плана. Сетка для этого не
   * годится: двери стоят там, где начерчены, а не в узлах клеток.
   */
  alignToNeighbours: boolean;
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
  /** Просьба показать план целиком: карта выполняет её при каждом новом значении. */
  fitPlanRequest: number;
  displayFilters: DisplayFilters;
  gridSettings: GridSettings;

  setCurrentBuilding: (buildingId: string | null) => void;
  setCurrentFloor: (floor: number | null) => void;
  setCameraCenter: (x: number, y: number, zoom?: number) => void;
  clearCameraCenter: () => void;
  requestFitPlan: () => void;
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
  fitPlanRequest: 0,

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
    alignToNeighbours: true,
    enabled: false,
    size: 20,
    snap: true,
    visible: true,
  },

  setCurrentBuilding: (buildingId) =>
    set((state) => {
      state.currentBuilding = buildingId;
      state.currentFloor = buildingId ? (openingFloorOf(state.buildingMetas.get(buildingId)) ?? 1) : null;
      state.selectedNodeIds = new Set();
      // Начатое ребро и линия живут в пределах плана, а начатый переход —
      // наоборот: второй его конец почти всегда на другом этаже или в другом
      // корпусе. Прежде смена плана сбрасывала начало, и лестницу между
      // этажами нельзя было создать щелчками вовсе.
      state.edgeStartNodeId = null;
      state.chainLastNodeId = null;
      state.lineTool.start = null;
      state.lineTool.end = null;
      state.selectionBox = null;
      // План выбрал человек — метка маршрута больше не ведёт карту за собой.
      state.routeSimulation.follow = false;
    }),

  setCurrentFloor: (floor) =>
    set((state) => {
      state.currentFloor = floor;
      state.selectedNodeIds = new Set();
      state.edgeStartNodeId = null;
      state.chainLastNodeId = null;
      state.lineTool.start = null;
      state.lineTool.end = null;
      state.selectionBox = null;
      state.routeSimulation.follow = false;
    }),

  setCameraCenter: (x, y, zoom) =>
    set((s) => {
      s.cameraCenterRequest = { x, y, zoom };
    }),

  clearCameraCenter: () =>
    set((s) => {
      s.cameraCenterRequest = null;
    }),

  requestFitPlan: () =>
    set((s) => {
      s.fitPlanRequest += 1;
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
        s.routeSimulation.follow = false;
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
