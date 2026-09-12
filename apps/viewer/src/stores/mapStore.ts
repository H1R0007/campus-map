import { create } from 'zustand';
import { scopeOfFloor } from '@campus-map/core';
import type {
  AliasManager,
  BuildingMeta,
  CampusMeta,
  Graph,
  ViewScope,
} from '@campus-map/core';

/**
 * Состояние карты навигатора.
 *
 * Данные загружаются один раз и подменяются атомарно через `setData`.
 * Прежний набор из пяти отдельных сеттеров заставлял компоненты
 * перерисовываться на каждом шаге загрузки и допускал промежуточные
 * состояния, в которых граф уже новый, а метаданные корпусов ещё старые.
 */

/** Выбранный этаж корпуса. */
interface ActiveFloor {
  buildingId: string;
  floor: number;
}

/** Загруженный датасет в том виде, в каком его держит навигатор. */
interface MapData {
  graph: Graph;
  aliasManager: AliasManager;
  campusMeta: CampusMeta;
  buildingMetas: Map<string, BuildingMeta>;
}

interface MapState {
  graph: Graph | null;
  aliasManager: AliasManager | null;
  campusMeta: CampusMeta | null;
  buildingMetas: Map<string, BuildingMeta> | null;
  isDataLoaded: boolean;

  /**
   * Выбранный этаж. Единственный источник истины о том, что показано:
   * территория кампуса (`null`) или этаж конкретного корпуса.
   *
   * Отдельного флага режима просмотра намеренно нет: он полностью
   * выводился из этого поля и мог с ним разойтись, а `setViewMode` не
   * вызывался ни из одного компонента.
   */
  activeFloor: ActiveFloor | null;

  setData: (data: MapData) => void;
  setActiveFloor: (buildingId: string, floor: number) => void;
  clearActiveFloor: () => void;
}

/**
 * Область видимости карты для выбранного этажа.
 *
 * Производное значение, поэтому хранится не в сторе, а вычисляется:
 * дублировать источник истины — значит дать состоянию возможность
 * рассинхронизироваться. Само правило принадлежит ядру (`scopeOfFloor`),
 * здесь только переход от формы хранения навигатора к его аргументам.
 */
export function scopeOf(activeFloor: ActiveFloor | null): ViewScope {
  return scopeOfFloor(activeFloor?.buildingId ?? null, activeFloor?.floor ?? null);
}

/**
 * Этажи корпуса сверху вниз — в таком порядке их рисует панель этажей.
 */
export function floorsOfBuilding(meta: BuildingMeta | undefined): number[] {
  if (!meta) return [];
  return meta.floors.map((f) => f.floor).sort((a, b) => b - a);
}

/**
 * Низший этаж корпуса — точка входа при переходе с карты кампуса.
 */
export function lowestFloorOf(meta: BuildingMeta | undefined): number {
  const floors = floorsOfBuilding(meta);
  return floors.length > 0 ? floors[floors.length - 1] : 1;
}

export const useMapStore = create<MapState>((set) => ({
  graph: null,
  aliasManager: null,
  campusMeta: null,
  buildingMetas: null,
  isDataLoaded: false,

  activeFloor: null,

  setData: (data) => set({ ...data, isDataLoaded: true }),

  setActiveFloor: (buildingId, floor) => set({ activeFloor: { buildingId, floor } }),
  clearActiveFloor: () => set({ activeFloor: null }),
}));
