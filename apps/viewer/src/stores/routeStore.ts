import { create } from 'zustand';
import type { PathResult, PathfindingOptions } from '@campus-map/core';
import { DEFAULT_PATHFINDING_OPTIONS, findPath } from '@campus-map/core';
import { resolvePoint } from '../utils/deepLink';
import { routePassesScope } from '../utils/routeFloors';
import { scopeOf, useMapStore } from './mapStore';
import { useSettingsStore } from './settingsStore';

/** Какое из двух полей ввода сейчас редактируется. */
export type RouteField = 'from' | 'to';

interface RouteState {
  fromQuery: string;
  toQuery: string;

  fromNodeId: string | null;
  toNodeId: string | null;

  currentRoute: PathResult | null;

  options: PathfindingOptions;

  /** Правка текста поля. Маршрут не строит — см. запись 5 в `DECISIONS.md`. */
  setQuery: (field: RouteField, query: string) => void;

  /**
   * Точка маршрута, заданная узлом, — единственный способ сделать это из
   * интерфейса: подсказкой поиска, нажатием на карту, ссылкой.
   *
   * Если после этого известны обе точки, маршрут строится сразу: вторую
   * точку пользователь выбрал явно, и отдельное нажатие «Построить» ничего бы
   * не добавило. Набор текста в поле маршрут по-прежнему не строит.
   *
   * Текст поля — основное имя узла на языке интерфейса, а не форма имени, по
   * которой место нашлось: поиск идёт по всем языкам, и «Canteen» в русском
   * интерфейсе поле показывать не должно.
   *
   * @returns маршрут между точками либо `null`, если второй точки ещё нет
   */
  setPoint: (field: RouteField, nodeId: string) => PathResult | null;

  setOptions: (options: Partial<PathfindingOptions>) => void;
  buildRoute: () => void;
  clearRoute: () => void;
  swapPoints: () => void;
}

/**
 * Совпадает ли показанный маршрут с текущими точками.
 *
 * Концы маршрута не хранятся отдельно: они и есть первый и последний узел
 * пути. Лишнее поле здесь означало бы третью копию того, что уже записано
 * дважды — в запросе и в самом маршруте.
 */
function routeMatches(
  route: PathResult | null,
  fromNodeId: string | null,
  toNodeId: string | null
): boolean {
  if (!route?.found || route.path.length === 0) return false;

  return route.path[0] === fromNodeId && route.path[route.path.length - 1] === toNodeId;
}

export const useRouteStore = create<RouteState>((set, get) => {
  /**
   * Сбрасывает показанный маршрут, если он больше не ведёт между выбранными
   * точками. Иначе карточка печатала бы новый текст запроса рядом со старой
   * линией — и это расхождение ничем не выдавало себя.
   */
  const dropStaleRoute = (fromNodeId: string | null, toNodeId: string | null) => {
    if (!routeMatches(get().currentRoute, fromNodeId, toNodeId)) {
      set({ currentRoute: null });
    }
  };

  /** Общая запись точки для обоих полей: текст, узел и снятие устаревшего маршрута. */
  const applyPoint = (field: RouteField, query: string, nodeId: string | null) => {
    set(
      field === 'from'
        ? { fromQuery: query, fromNodeId: nodeId }
        : { toQuery: query, toNodeId: nodeId }
    );

    const { fromNodeId, toNodeId } = get();
    dropStaleRoute(fromNodeId, toNodeId);
  };

  /**
   * Строит маршрут между уже разрешёнными точками и показывает его.
   *
   * @param view `start` — новый маршрут, карта переходит к его началу;
   *        `keep` — пересчёт того же маршрута, открытый вид остаётся, если
   *        новый путь через него проходит (запись 5)
   * @returns результат поиска либо `null`, если строить не из чего.
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

    // Карта переходит туда, где маршрут начинается. Без этого построенный
    // маршрут не было видно: навигатор стартует в виде кампуса, а слой
    // маршрута рисует только узлы текущей области видимости. Пересчёт того же
    // маршрута не уводит человека с этажа, который он рассматривает, — если
    // линия на этом этаже осталась.
    const map = useMapStore.getState();
    const keepView = view === 'keep' && routePassesScope(graph, route.path, scopeOf(map.activeFloor));
    if (!keepView) map.showNode(route.path[0]);

    return route;
  };

  return {
    fromQuery: '',
    toQuery: '',
    fromNodeId: null,
    toNodeId: null,
    currentRoute: null,

    // Значения по умолчанию принадлежат ядру: здесь раньше лежала их копия,
    // и расхождение между двумя наборами никто бы не заметил.
    options: { ...DEFAULT_PATHFINDING_OPTIONS },

    setQuery: (field, query) => {
      const { graph, aliasManager } = useMapStore.getState();
      applyPoint(field, query, resolvePoint(query, graph, aliasManager));
    },

    setPoint: (field, nodeId) => {
      const aliasManager = useMapStore.getState().aliasManager;
      const language = useSettingsStore.getState().language;

      applyPoint(field, aliasManager?.getPrimaryAliasForId(nodeId, language) ?? nodeId, nodeId);

      const { fromNodeId, toNodeId, currentRoute } = get();
      if (fromNodeId === null || toNodeId === null) return null;

      // Маршрут между этими точками уже показан — `dropStaleRoute` его оставил.
      return currentRoute ?? computeRoute('start');
    },

    setOptions: (patch) => {
      set({ options: { ...get().options, ...patch } });

      // Пересчитываем только уже показанный маршрут. Раньше условием было
      // «обе точки разрешены», и переключение галочки строило маршрут,
      // которого пользователь не просил. Концы прежние — вид карты остаётся.
      if (get().currentRoute) computeRoute('keep');
    },

    buildRoute: () => {
      computeRoute('start');
    },

    clearRoute: () =>
      set({
        fromQuery: '',
        toQuery: '',
        fromNodeId: null,
        toNodeId: null,
        currentRoute: null,
      }),

    swapPoints: () => {
      const { fromQuery, toQuery, fromNodeId, toNodeId, currentRoute } = get();
      const hadRoute = currentRoute !== null;

      set({
        fromQuery: toQuery,
        toQuery: fromQuery,
        fromNodeId: toNodeId,
        toNodeId: fromNodeId,
        // Маршрут направлен, поэтому показывать прежний результат нельзя.
        currentRoute: null,
      });

      // Маршрут был показан — пересчитываем в обратную сторону сразу, без
      // лишнего нажатия. Если его не было, обмен местами — это просто правка
      // полей, и строить маршрут по своей инициативе не нужно.
      if (hadRoute) computeRoute('start');
    },
  };
});
