import { create } from 'zustand';
import type { PathResult, PlaceCategory } from '@campus-map/core';

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
  /**
   * Быстрая кнопка, для которой ищется начало маршрута: где человек, неизвестно,
   * и после выбора начала маршрут поведёт к ближайшему месту этой категории.
   */
  nearestCategory: PlaceCategory | null;
  openSearch: (target: SearchTarget, nearestCategory?: PlaceCategory) => void;
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
  nearestCategory: null,
  openSearch: (target, nearestCategory) => set({ searchTarget: target, nearestCategory: nearestCategory ?? null }),
  closeSearch: () => set({ searchTarget: null, nearestCategory: null }),

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
 * - `arrived` — прибытие после последнего шага: «Обратно» и «К выходу»;
 * - `navigate` — шаг пошаговой навигации по маршруту;
 * - `route` — обзор маршрута или причина, почему он не найден;
 * - `idle` — поиск.
 *
 * Выводится из состояния, а не хранится: отдельное поле режима разошлось бы с
 * выбранным местом и маршрутом.
 */
export type SheetMode = 'place' | 'arrived' | 'navigate' | 'route' | 'idle';

export function sheetModeOf(state: {
  selectedNodeId: string | null;
  currentRoute: PathResult | null;
  stepIndex: number | null;
  arrived?: boolean;
}): SheetMode {
  if (state.selectedNodeId !== null) return 'place';
  if (state.currentRoute?.found && state.arrived === true) return 'arrived';
  if (state.currentRoute?.found && state.stepIndex !== null) return 'navigate';
  if (state.currentRoute !== null) return 'route';
  return 'idle';
}
