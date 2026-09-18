import { DEFAULT_PATHFINDING_OPTIONS, findAlternativePaths } from '@campus-map/core';
import type { PathResult, PathfindingOptions } from '@campus-map/core';
import { buildGraphFromState } from './graphState';
import type { EditorSlice } from './types';

export interface RouteSimulation {
  active: boolean;
  fromNodeId: string | null;
  toNodeId: string | null;

  /**
   * Найденные маршруты: основной первым, затем альтернативы.
   *
   * Хранятся результаты поиска целиком, а не только списки узлов: длина и
   * время пути нужны разметчику, чтобы проверить привязку планов, а
   * пересчитывать их при показе значило бы строить граф заново на каждое
   * изменение стора. Прежние `path` и `alternativePaths` дублировали друг
   * друга: `path` всегда был первым элементом второго.
   */
  routes: PathResult[];

  animationIndex: number;
  selectedPathIndex: number;
  animationSpeed: number;

  /** Идёт ли метка по маршруту. Пауза оставляет линию на карте. */
  playing: boolean;

  /**
   * Вести ли карту за меткой на другие этажи.
   *
   * По умолчанию нет: пока маршрут показан, разметчик обычно правит тот же
   * этаж, а редактор прежде переключал план каждые несколько долей секунды —
   * работать было невозможно. Любое переключение плана человеком снимает
   * слежение.
   */
  follow: boolean;

  pathfindingOptions: PathfindingOptions;
}

/** Симулятор без маршрута. Значения поиска по умолчанию принадлежат ядру. */
export function initialRouteSimulation(): RouteSimulation {
  return {
    active: false,
    fromNodeId: null,
    toNodeId: null,
    routes: [],
    animationIndex: 0,
    selectedPathIndex: 0,
    animationSpeed: 800,
    playing: true,
    follow: false,
    pathfindingOptions: { ...DEFAULT_PATHFINDING_OPTIONS },
  };
}

/**
 * Симулятор маршрута: тот же поиск, что у навигатора, на текущих правках.
 */
export interface RouteSlice {
  routeSimulation: RouteSimulation;
  routePickMode: boolean;
  routePickTarget: 'from' | 'to' | null;

  setRouteSimulation: (sim: Partial<RouteSimulation>) => void;
  calculateRoute: (fromId: string, toId: string) => void;
  setRoutePathfindingOptions: (opts: Partial<PathfindingOptions>) => void;
  setRoutePlaying: (playing: boolean) => void;
  setRouteFollow: (follow: boolean) => void;
  setRouteSelectedPath: (index: number) => void;
  setRouteAnimationSpeed: (speed: number) => void;

  setRoutePickMode: (enabled: boolean) => void;
  setRoutePickTarget: (target: 'from' | 'to' | null) => void;
  pickRouteNode: (nodeId: string) => boolean;
}

export const createRouteSlice: EditorSlice<RouteSlice> = (set, get) => ({
  routeSimulation: initialRouteSimulation(),
  routePickMode: true,
  routePickTarget: 'from',

  setRouteSimulation: (sim) =>
    set((s) => {
      Object.assign(s.routeSimulation, sim);
    }),

  /**
   * Строит маршрут и альтернативы тем же поиском и той же моделью
   * стоимости, что и навигатор.
   */
  calculateRoute: (fromId, toId) => {
    const state = get();

    const { primary, alternatives } = findAlternativePaths(
      buildGraphFromState(state),
      fromId,
      toId,
      state.routeSimulation.pathfindingOptions,
      3
    );

    // Альтернатив без найденного основного пути не бывает, поэтому пустой
    // список означает «маршрута нет».
    const routes = [primary, ...alternatives].filter((route) => route.found);

    set((s) => {
      s.routeSimulation.fromNodeId = fromId;
      s.routeSimulation.toNodeId = toId;
      s.routeSimulation.routes = routes;
      s.routeSimulation.animationIndex = 0;
      s.routeSimulation.selectedPathIndex = 0;
      s.routeSimulation.active = routes.length > 0;
    });
  },

  setRoutePathfindingOptions: (opts) =>
    set((s) => {
      Object.assign(s.routeSimulation.pathfindingOptions, opts);
    }),

  setRoutePlaying: (playing) =>
    set((s) => {
      s.routeSimulation.playing = playing;
    }),

  setRouteFollow: (follow) =>
    set((s) => {
      s.routeSimulation.follow = follow;
    }),

  setRouteSelectedPath: (index) =>
    set((s) => {
      s.routeSimulation.selectedPathIndex = index;
      s.routeSimulation.animationIndex = 0;
    }),

  setRouteAnimationSpeed: (speed) =>
    set((s) => {
      s.routeSimulation.animationSpeed = speed;
    }),

  setRoutePickMode: (enabled) =>
    set((s) => {
      s.routePickMode = enabled;
      if (!enabled) s.routePickTarget = null;
    }),

  setRoutePickTarget: (target) =>
    set((s) => {
      s.routePickTarget = target;
    }),

  pickRouteNode: (nodeId) => {
    const st = get();
    // Точки задаются щелчком, только пока вкладка маршрута видна.
    if (!st.routePickMode || st.inspectorTab !== 'route' || st.inspectorCollapsed) return false;

    const node = st.nodes.get(nodeId);
    if (!node) return false;

    if (st.routePickTarget === 'from' || (!st.routeSimulation.fromNodeId && !st.routePickTarget)) {
      set((s) => {
        s.routeSimulation.fromNodeId = nodeId;
        s.routePickTarget = 'to';
      });
      return true;
    }

    if (st.routePickTarget === 'to' || (!st.routeSimulation.toNodeId && st.routeSimulation.fromNodeId)) {
      set((s) => {
        s.routeSimulation.toNodeId = nodeId;
        s.routePickTarget = null;
      });
      const fromId = st.routeSimulation.fromNodeId;
      if (fromId) {
        setTimeout(() => get().calculateRoute(fromId, nodeId), 0);
      }
      return true;
    }

    return false;
  },
});
