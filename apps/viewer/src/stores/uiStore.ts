import { create } from 'zustand';
import type { PathResult } from '@campus-map/core';

/**
 * Состояние оболочки навигатора: поиск, шторка и место, которое она занимает
 * над картой.
 *
 * Отдельно от сторов карты и маршрута: это не данные кампуса и не маршрут, и
 * раскрытие шторки не должно будить их подписчиков.
 */

/**
 * Для чего открыт поиск: найти место или задать начало либо конец маршрута.
 *
 * `place` — место показывается на карте с карточкой; `from` и `to` — выбор
 * сразу становится точкой маршрута.
 */
export type SearchTarget = 'place' | 'from' | 'to';

/**
 * Сколько карты закрывает панель навигатора, CSS-пиксели: снизу на телефоне,
 * слева на широком экране.
 *
 * Измеряется, а не задаётся числом: высота шторки зависит от режима, длины
 * названий на языке интерфейса и масштаба страницы (запись 17).
 */
export interface MapObstruction {
  bottom: number;
  left: number;
}

interface UiState {
  searchTarget: SearchTarget | null;
  openSearch: (target: SearchTarget) => void;
  closeSearch: () => void;

  /** Шторка на телефоне раскрыта. На широком экране панель раскрыта всегда. */
  sheetExpanded: boolean;
  setSheetExpanded: (expanded: boolean) => void;

  mapObstruction: MapObstruction;
  setMapObstruction: (obstruction: MapObstruction) => void;
}

const NO_OBSTRUCTION: MapObstruction = Object.freeze({ bottom: 0, left: 0 });

export const useUiStore = create<UiState>((set, get) => ({
  searchTarget: null,
  openSearch: (target) => set({ searchTarget: target }),
  closeSearch: () => set({ searchTarget: null }),

  sheetExpanded: false,
  setSheetExpanded: (expanded) => {
    if (get().sheetExpanded !== expanded) set({ sheetExpanded: expanded });
  },

  mapObstruction: NO_OBSTRUCTION,
  setMapObstruction: (obstruction) => {
    const current = get().mapObstruction;
    // Новый объект при тех же числах пересчитал бы пределы карты зря.
    if (current.bottom === obstruction.bottom && current.left === obstruction.left) return;
    set({ mapObstruction: obstruction });
  },
}));

/**
 * Что показывает панель — по важности:
 * - `place` — место, выбранное на карте или в поиске: человек только что его выбрал;
 * - `route` — обзор маршрута или причина, почему он не найден;
 * - `idle` — поиск.
 *
 * Выводится из состояния, а не хранится: отдельное поле режима разошлось бы с
 * выбранным местом и маршрутом.
 */
export type SheetMode = 'place' | 'route' | 'idle';

export function sheetModeOf(state: { selectedNodeId: string | null; currentRoute: PathResult | null }): SheetMode {
  if (state.selectedNodeId !== null) return 'place';
  if (state.currentRoute !== null) return 'route';
  return 'idle';
}
