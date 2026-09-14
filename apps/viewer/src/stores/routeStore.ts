import { create } from 'zustand';
import type { PathResult, PathfindingOptions } from '@campus-map/core';
import { DEFAULT_PATHFINDING_OPTIONS, findPath } from '@campus-map/core';
import { routePassesScope } from '../utils/routeFloors';
import { scopeOf, useMapStore } from './mapStore';

/** Точка маршрута: начало или конец. */
export type RouteField = 'from' | 'to';

interface RouteState {
  /**
   * Точки маршрута — узлы. Подписи к ним не хранятся: имя на языке интерфейса
   * выводится из узла при отрисовке (`nodeName`), и смена языка переименовывает
   * точки сама. Раньше здесь лежал текст полей ввода, и он оставался на прежнем
   * языке.
   */
  fromNodeId: string | null;
  toNodeId: string | null;

  currentRoute: PathResult | null;

  options: PathfindingOptions;

  /**
   * Точка маршрута, заданная узлом, — единственный способ сделать это из
   * интерфейса: поиском, нажатием на карту, ссылкой.
   *
   * Если после этого известны обе точки, маршрут строится сразу: вторую
   * точку пользователь выбрал явно, и отдельное «Построить» ничего бы не
   * добавило.
   *
   * @returns маршрут между точками либо `null`, если второй точки ещё нет
   */
  setPoint: (field: RouteField, nodeId: string) => PathResult | null;

  /** Снимает одну точку, например «вы здесь» из ссылки; маршрут снимается вместе с ней. */
  clearPoint: (field: RouteField) => void;

  setOptions: (options: Partial<PathfindingOptions>) => void;
  clearRoute: () => void;
  swapPoints: () => void;
}

export const useRouteStore = create<RouteState>((set, get) => {
  /**
   * Строит маршрут между уже известными точками и показывает его.
   *
   * @param view `start` — новый маршрут, карта переходит к его началу;
   *        `keep` — пересчёт того же маршрута, открытый вид остаётся, если
   *        новый путь через него проходит (запись 5)
   * @returns результат поиска либо `null`, если строить не из чего
   */
  const computeRoute = (view: 'start' | 'keep'): PathResult | null => {
    const { fromNodeId, toNodeId, options } = get();
    const graph = useMapStore.getState().graph;

    if (!graph || !fromNodeId || !toNodeId) {
      set({ currentRoute: null });
      return null;
    }

    const route = findPath(graph, fromNodeId, toNodeId, options);
    set({ currentRoute: route });

    if (!route.found) return route;

    // Карта переходит туда, где маршрут начинается: слой маршрута рисует
    // только узлы текущей области видимости. Пересчёт того же маршрута не
    // уводит человека с этажа, который он рассматривает, — если линия там
    // осталась.
    const map = useMapStore.getState();
    const keepView = view === 'keep' && routePassesScope(graph, route.path, scopeOf(map.activeFloor));
    if (!keepView) map.showNode(route.path[0]);

    return route;
  };

  return {
    fromNodeId: null,
    toNodeId: null,
    currentRoute: null,

    // Значения по умолчанию принадлежат ядру: здесь раньше лежала их копия,
    // и расхождение между двумя наборами никто бы не заметил.
    options: { ...DEFAULT_PATHFINDING_OPTIONS },

    setPoint: (field, nodeId) => {
      const { currentRoute } = get();
      const current = field === 'from' ? get().fromNodeId : get().toNodeId;

      // Та же точка при показанном маршруте — маршрут остаётся как есть.
      if (current === nodeId && currentRoute !== null) return currentRoute;

      set(field === 'from' ? { fromNodeId: nodeId } : { toNodeId: nodeId });

      const { fromNodeId, toNodeId } = get();
      if (fromNodeId === null || toNodeId === null) {
        set({ currentRoute: null });
        return null;
      }

      return computeRoute('start');
    },

    clearPoint: (field) =>
      set(field === 'from' ? { fromNodeId: null, currentRoute: null } : { toNodeId: null, currentRoute: null }),

    setOptions: (patch) => {
      set({ options: { ...get().options, ...patch } });

      // Пересчитывается только уже показанный маршрут: переключение
      // ограничения не строит маршрут, которого не просили. Концы прежние —
      // вид карты остаётся.
      if (get().currentRoute) computeRoute('keep');
    },

    clearRoute: () => set({ fromNodeId: null, toNodeId: null, currentRoute: null }),

    swapPoints: () => {
      const { fromNodeId, toNodeId, currentRoute } = get();
      set({ fromNodeId: toNodeId, toNodeId: fromNodeId });

      // Маршрут направлен, и прежний результат показывать нельзя. Был показан —
      // пересчитываем в обратную сторону сразу; не был — обмен только меняет
      // точки.
      if (currentRoute !== null) computeRoute('start');
    },
  };
});
