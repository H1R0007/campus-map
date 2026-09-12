import { create } from 'zustand';
import type {
  AliasManager,
  Graph,
  PathResult,
  PathfindingOptions,
  SearchSuggestion,
} from '@campus-map/core';
import { findPath } from '@campus-map/core';
import { useMapStore } from './mapStore';

/** Какое из двух полей ввода сейчас редактируется. */
export type RouteField = 'from' | 'to';

/**
 * Ограничения маршрута по умолчанию: всё разрешено, лифт не предпочтителен.
 *
 * Все четыре типа переходов выведены в интерфейс — раньше в сторе лежало
 * несуществующее поле `allowDoor`, а настоящее `allowEntrance` не
 * выставлялось и не показывалось пользователю, из-за чего ограничение
 * «не выходить на улицу» было недоступно, хотя ядро его поддерживало.
 */
const DEFAULT_OPTIONS: PathfindingOptions = {
  allowStairs: true,
  allowLift: true,
  allowBridge: true,
  allowEntrance: true,
  preferLift: false,
};

interface RouteState {
  fromQuery: string;
  toQuery: string;

  fromNodeId: string | null;
  toNodeId: string | null;

  fromSuggestions: SearchSuggestion[];
  toSuggestions: SearchSuggestion[];

  /** Поле, для которого показан список подсказок. */
  activeField: RouteField | null;

  currentRoute: PathResult | null;

  options: PathfindingOptions;

  setQuery: (field: RouteField, query: string) => void;
  setActiveField: (field: RouteField | null) => void;
  selectSuggestion: (field: RouteField, suggestion: SearchSuggestion) => void;
  setOptions: (options: Partial<PathfindingOptions>) => void;
  buildRoute: () => void;
  clearRoute: () => void;
  swapPoints: () => void;
}

/**
 * Разрешает введённый текст в id узла.
 *
 * Сначала — точное совпадение с алиасом, затем прямой id узла: это позволяет
 * открывать ссылку вида `?from=a1_room101` и отлаживать данные без алиасов.
 */
function resolveQuery(
  query: string,
  graph: Graph | null,
  aliasManager: AliasManager | null
): string | null {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const byAlias = aliasManager?.resolve(trimmed) ?? null;
  if (byAlias) return byAlias;

  return graph?.hasNode(trimmed) ? trimmed : null;
}

export const useRouteStore = create<RouteState>((set, get) => {
  /**
   * Общая реализация для полей «откуда» и «куда».
   *
   * Прежде `setFromQuery` и `setToQuery` были двумя копиями одиннадцати
   * строк и успели получить одинаковый комментарий-маркер правки.
   */
  const applyQuery = (field: RouteField, query: string) => {
    const { graph, aliasManager } = useMapStore.getState();

    const suggestions = query.trim() ? (aliasManager?.suggest(query, 5) ?? []) : [];
    const nodeId = resolveQuery(query, graph, aliasManager);

    set(
      field === 'from'
        ? { fromQuery: query, fromSuggestions: suggestions, fromNodeId: nodeId }
        : { toQuery: query, toSuggestions: suggestions, toNodeId: nodeId }
    );
  };

  const applySuggestion = (field: RouteField, suggestion: SearchSuggestion) => {
    set(
      field === 'from'
        ? { fromQuery: suggestion.alias, fromNodeId: suggestion.id, fromSuggestions: [], activeField: null }
        : { toQuery: suggestion.alias, toNodeId: suggestion.id, toSuggestions: [], activeField: null }
    );
  };

  return {
    fromQuery: '',
    toQuery: '',
    fromNodeId: null,
    toNodeId: null,
    fromSuggestions: [],
    toSuggestions: [],
    activeField: null,
    currentRoute: null,
    options: { ...DEFAULT_OPTIONS },

    setQuery: (field, query) => applyQuery(field, query),

    setActiveField: (field) => set({ activeField: field }),

    selectSuggestion: (field, suggestion) => applySuggestion(field, suggestion),

    setOptions: (patch) => {
      const options = { ...get().options, ...patch };
      set({ options });

      // Ограничения влияют на результат, поэтому уже построенный маршрут
      // пересчитывается сразу — иначе панель показала бы устаревший путь.
      const { fromNodeId, toNodeId } = get();
      if (fromNodeId && toNodeId) {
        const graph = useMapStore.getState().graph;
        if (graph) set({ currentRoute: findPath(graph, fromNodeId, toNodeId, options) });
      }
    },

    buildRoute: () => {
      const { fromNodeId, toNodeId, options } = get();
      const graph = useMapStore.getState().graph;

      if (!graph || !fromNodeId || !toNodeId) {
        set({ currentRoute: null });
        return;
      }

      set({ currentRoute: findPath(graph, fromNodeId, toNodeId, options), activeField: null });
    },

    clearRoute: () =>
      set({
        fromQuery: '',
        toQuery: '',
        fromNodeId: null,
        toNodeId: null,
        fromSuggestions: [],
        toSuggestions: [],
        currentRoute: null,
        activeField: null,
      }),

    swapPoints: () => {
      const { fromQuery, toQuery, fromNodeId, toNodeId } = get();
      set({
        fromQuery: toQuery,
        toQuery: fromQuery,
        fromNodeId: toNodeId,
        toNodeId: fromNodeId,
        fromSuggestions: [],
        toSuggestions: [],
        // Маршрут направлен, поэтому показывать прежний результат нельзя.
        currentRoute: null,
      });

      // Обе точки на месте — пересчитываем сразу, без лишнего нажатия.
      const graph = useMapStore.getState().graph;
      if (graph && toNodeId && fromNodeId) {
        set({ currentRoute: findPath(graph, toNodeId, fromNodeId, get().options) });
      }
    },
  };
});
