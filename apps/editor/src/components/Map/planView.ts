import { createContext, useContext } from 'react';

/**
 * Какой план показывает карта и её место среди окон (запись 66).
 *
 * Слои карты берут план отсюда, а не из стора: у второй карты свой план.
 * Активная карта показывает открытый план стора — с ним работают правка и
 * инспектор; неактивная только показывает и при нажатии становится активной.
 */
export interface PlanView {
  /** Индекс карты среди окон. */
  group: number;
  /** Получает ли карта щелчки, клавиши и команды. */
  active: boolean;
  building: string | null;
  floor: number | null;
}

export const PlanViewContext = createContext<PlanView>({ group: 0, active: true, building: null, floor: null });

export const usePlanView = (): PlanView => useContext(PlanViewContext);
