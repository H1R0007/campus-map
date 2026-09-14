import { createContext } from 'react';
import type { ImageStatus } from './useImageSize.js';

/**
 * Сообщает холсту состояние загрузки видимого плана.
 *
 * @param id постоянный id плана на время его жизни
 * @returns отписка: план скрыт или снят с карты
 */
export type PlanStatusReporter = (id: string, status: ImageStatus) => () => void;

/** Приёмник состояний планов у `WorldMap`; вне холста планы ничего не сообщают. */
export const PlanStatusContext = createContext<PlanStatusReporter | null>(null);

/**
 * Одно состояние на все видимые планы: недоступный план важнее грузящегося, а
 * «готово» — только когда готовы все.
 */
export function combinePlanStatuses(statuses: Iterable<ImageStatus>): ImageStatus {
  let combined: ImageStatus = 'ready';
  for (const status of statuses) {
    if (status === 'error') return 'error';
    if (status === 'loading') combined = 'loading';
  }
  return combined;
}
