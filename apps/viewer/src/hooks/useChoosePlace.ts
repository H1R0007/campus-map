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

  return (target, nodeId) => {
    remember(nodeId);
    closeSearch();

    if (target === 'place') {
      // Сначала этаж места, затем выбор: смена этажа снимает выбранное место.
      showNode(nodeId);
      selectNode(nodeId);
      return;
    }

    if (setPoint(target, nodeId) === null) openSearch(target === 'from' ? 'to' : 'from');
  };
}
