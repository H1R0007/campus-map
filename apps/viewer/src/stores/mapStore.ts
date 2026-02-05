import { create } from 'zustand';
import { Graph, AliasManager, BuildingMeta, CampusMeta } from '@campus-map/core';

// Типы состояния
export type ViewMode = 'campus' | 'floor';

interface ActiveFloor {
  buildingId: string;
  floor: number;
}

interface MapState {
  // Данные
  graph: Graph | null;
  aliasManager: AliasManager | null;
  campusMeta: CampusMeta | null;
  buildingMetas: Map<string, BuildingMeta>;
  isDataLoaded: boolean;

  // Текущий вид
  viewMode: ViewMode;
  activeFloor: ActiveFloor | null;
  zoomLevel: number;

  // Действия
  setGraph: (graph: Graph) => void;
  setAliasManager: (manager: AliasManager) => void;
  setCampusMeta: (meta: CampusMeta) => void;
  addBuildingMeta: (id: string, meta: BuildingMeta) => void;
  setDataLoaded: (loaded: boolean) => void;

  setViewMode: (mode: ViewMode) => void;
  setActiveFloor: (buildingId: string, floor: number) => void;
  clearActiveFloor: () => void;
  setZoomLevel: (zoom: number) => void;

  // Хелперы
  getBuildingMeta: (id: string) => BuildingMeta | undefined;
  getFloorsForBuilding: (id: string) => number[];
}

export const useMapStore = create<MapState>((set, get) => ({
  // Начальное состояние
  graph: null,
  aliasManager: null,
  campusMeta: null,
  buildingMetas: new Map(),
  isDataLoaded: false,

  viewMode: 'campus',
  activeFloor: null,
  zoomLevel: 1,

  // Сеттеры данных
  setGraph: (graph) => set({ graph }),
  setAliasManager: (manager) => set({ aliasManager: manager }),
  setCampusMeta: (meta) => set({ campusMeta: meta }),
  addBuildingMeta: (id, meta) =>
    set((state) => {
      const newMap = new Map(state.buildingMetas);
      newMap.set(id, meta);
      return { buildingMetas: newMap };
    }),
  setDataLoaded: (loaded) => set({ isDataLoaded: loaded }),

  // Управление видом
  setViewMode: (mode) => set({ viewMode: mode }),
  setActiveFloor: (buildingId, floor) =>
    set({
      viewMode: 'floor',
      activeFloor: { buildingId, floor },
    }),
  clearActiveFloor: () =>
    set({
      viewMode: 'campus',
      activeFloor: null,
    }),
  setZoomLevel: (zoom) => set({ zoomLevel: zoom }),

  // Хелперы
  getBuildingMeta: (id) => get().buildingMetas.get(id),
  getFloorsForBuilding: (id) => {
    const meta = get().buildingMetas.get(id);
    if (!meta) return [];
    return meta.floors.map((f) => f.floor).sort((a, b) => b - a);
  },
}));