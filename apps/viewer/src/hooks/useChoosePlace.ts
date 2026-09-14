import { useMapStore } from '../stores/mapStore';
import { useRecentStore } from '../stores/recentStore';
import { useRouteStore } from '../stores/routeStore';
import { useUiStore } from '../stores/uiStore';
import type { SearchTarget } from '../stores/uiStore';

/**
 * Выбор места — из подсказок поиска или из недавних. Что он делает, зависит от
 * цели:
 * - `place` — место показывается на карте с карточкой;
 * - `from` и `to` — место становится точкой маршрута; если второй точки ещё
 *   нет, поиск открывается для неё — это следующий шаг.
 *
 * Одно правило на оба источника: недавнее место, выбранное в пустом поиске,
 * не должно вести себя иначе, чем то же место, найденное набором.
 * Выбранное место запоминается в недавних.
 */
export function useChoosePlace(): (target: SearchTarget, nodeId: string) => void {
  const showNode = useMapStore((s) => s.showNode);
  const selectNode = useMapStore((s) => s.selectNode);
  const setPoint = useRouteStore((s) => s.setPoint);
  const openSearch = useUiStore((s) => s.openSearch);
  const closeSearch = useUiStore((s) => s.closeSearch);
  const remember = useRecentStore((s) => s.remember);
  const routeToNearest = useRouteStore((s) => s.routeToNearest);

  return (target, nodeId) => {
    // Читается до закрытия поиска: закрытие снимает и быструю кнопку.
    const nearestCategory = useUiStore.getState().nearestCategory;
    remember(nodeId);
    closeSearch();

    if (target === 'place') {
      // Сначала этаж места, затем выбор: смена этажа снимает выбранное место.
      showNode(nodeId);
      selectNode(nodeId);
      return;
    }

    // Начало для быстрой кнопки: маршрут — к ближайшему месту категории. Если
    // его не нашлось, панель покажет кнопку недоступной.
    if (target === 'from' && nearestCategory !== null) {
      setPoint('from', nodeId);
      routeToNearest(nearestCategory);
      return;
    }

    if (setPoint(target, nodeId) === null) openSearch(target === 'from' ? 'to' : 'from');
  };
}
