import { edgeKey, findConnectedComponents, isNodeInScope, scopeOfFloor } from '@campus-map/core';
import type {
  AliasEntry,
  BuildingMeta,
  CampusMeta,
  ConnectivityResult,
  Dataset,
  MapNode,
  PlaceCategory,
  Transition,
} from '@campus-map/core';
import { useHistoryStore } from '../historyStore';
import { buildGraphFromState } from './graphState';
import { initialRouteSimulation } from './routeSlice';
import { searchNodeHits } from '../../utils/nodeSearch';
import type { EditorSlice } from './types';

/**
 * Данные кампуса, которые правит редактор, и выборки из них.
 */
export interface DataSlice {
  nodes: Map<string, MapNode>;
  transitions: Transition[];
  buildingMetas: Map<string, BuildingMeta>;
  aliases: Map<string, string[]>;

  /**
   * Переводы алиасов в том виде, в каком они пришли из датасета.
   *
   * Правки переводов в редакторе пока нет, но сохранить их он обязан: алиасы
   * стор держит списками имён, и без этого поля переводы молча пропадали бы
   * при первом же экспорте. Ни одно действие поле не меняет, поэтому в отмене
   * оно не участвует: узел, восстановленный отменой удаления, получает свои
   * переводы обратно, а переводы удалённого узла отбрасывает экспорт.
   */
  aliasTranslations: ReadonlyMap<string, NonNullable<AliasEntry['translations']>>;

  /**
   * Категории мест из датасета (запись 19). Правки категорий в редакторе пока
   * нет; поле живёт по правилам `aliasTranslations`: сохраняется при экспорте и
   * в отмене не участвует.
   */
  aliasCategories: ReadonlyMap<string, PlaceCategory>;

  /**
   * Метаданные кампуса, из которых был загружен датасет.
   *
   * Редактор их не меняет, но обязан сохранить при экспорте: без них
   * приходилось выдумывать `mapSize` заново по границам узлов, и круг
   * «загрузил — сохранил» портил исходные данные.
   */
  campusMeta: CampusMeta | null;

  /**
   * Предупреждения загрузчика ядра о проблемах в исходных файлах.
   *
   * Показываются в панели диагностики: редактор должен уметь открыть даже
   * битый датасет и объяснить, что с ним не так, а не проглатывать это.
   */
  loadWarnings: string[];

  isLoading: boolean;
  nodeIdCounter: number;

  /**
   * Принимает датасет.
   *
   * `unsaved` ставится при восстановлении черновика: данные в редакторе
   * отличаются от лежащих на диске, и строка состояния обязана это показать.
   */
  loadData: (dataset: Dataset, warnings?: string[], options?: { unsaved?: boolean }) => void;

  getNode: (nodeId: string) => MapNode | undefined;
  getNodeAliases: (nodeId: string) => string[];
  getNodeComment: (nodeId: string) => string;
  getTransitionsForNode: (nodeId: string) => Transition[];
  getNodesForCurrentFloor: () => MapNode[];
  getEdgesForCurrentFloor: () => { from: string; to: string }[];
  getVisibleTransitions: () => Transition[];

  getOrphanNodes: () => MapNode[];
  getNodesWithoutAlias: () => MapNode[];
  getNodesWithErrors: () => MapNode[];
  isGraphConnected: () => ConnectivityResult;

  searchNodes: (query: string) => MapNode[];
}

const NO_ALIASES: string[] = [];

/**
 * Узлы открытого плана.
 *
 * Чистая функция, а не только действие стора: слои карты считают по ней
 * выборку в `useMemo` от самих данных и не пересчитывают её на каждое
 * изменение стора.
 */
export function floorNodesOf(
  nodes: ReadonlyMap<string, MapNode>,
  building: string | null,
  floor: number | null,
  showPortals: boolean
): MapNode[] {
  const scope = scopeOfFloor(building, floor);
  const result: MapNode[] = [];
  for (const node of nodes.values()) {
    if (isNodeInScope(node, scope) && (showPortals || !node.isPortal)) result.push(node);
  }
  return result;
}

export const createDataSlice: EditorSlice<DataSlice> = (set, get) => ({
  nodes: new Map(),
  transitions: [],
  buildingMetas: new Map(),
  aliases: new Map(),
  aliasTranslations: new Map(),
  aliasCategories: new Map(),
  campusMeta: null,
  loadWarnings: [],
  isLoading: true,
  nodeIdCounter: 1,

  /**
   * Принимает нормализованный датасет из ядра.
   *
   * Узлы приходят уже приведёнными к `MapNode`: `building` и `floor`
   * проставлены загрузчиком из пути файла, `neighbors` — массив, рабочая
   * заметка `comment` сохранена. Нормализовать что-либо повторно здесь
   * значит поддерживать второй пайплайн приведения данных.
   */
  loadData: (dataset, warnings = [], options = {}) =>
    set((state) => {
      state.nodes = new Map();
      let maxCounter = 0;

      for (const node of dataset.nodes) {
        state.nodes.set(node.id, { ...node, neighbors: [...node.neighbors] });
        const match = node.id.match(/_node_(\d+)$/);
        if (match) maxCounter = Math.max(maxCounter, Number.parseInt(match[1], 10));
      }

      state.nodeIdCounter = maxCounter + 1;
      state.transitions = [...dataset.transitions];
      state.buildingMetas = new Map();
      for (const meta of dataset.buildingMetas) state.buildingMetas.set(meta.id, meta);
      state.aliases = new Map();
      for (const alias of dataset.aliases) state.aliases.set(alias.id, [...(alias.names ?? [])]);
      state.aliasTranslations = new Map(
        dataset.aliases.flatMap((alias) => (alias.translations ? [[alias.id, alias.translations] as const] : []))
      );
      state.aliasCategories = new Map(
        dataset.aliases.flatMap((alias) => (alias.category ? [[alias.id, alias.category] as const] : []))
      );
      state.campusMeta = dataset.campusMeta;
      state.loadWarnings = [...warnings];
      state.selectedNodeIds = new Set();
      state.edgeStartNodeId = null;
      state.transitionStartNodeId = null;
      state.isLoading = false;
      state.lineTool.start = null;
      state.lineTool.end = null;
      state.selectionBox = null;
      state.routeSimulation = initialRouteSimulation();

      useHistoryStore.getState().clear();
      // −1 не совпадает ни с одним состоянием истории: восстановленный
      // черновик считается несохранённым, пока его не сохранят.
      state.savedStateId = options.unsaved === true ? -1 : 0;
    }),

  getNode: (nodeId) => get().nodes.get(nodeId),

  getNodeAliases: (nodeId) => get().aliases.get(nodeId) ?? NO_ALIASES,

  getNodeComment: (nodeId) => get().nodes.get(nodeId)?.comment ?? '',

  getTransitionsForNode: (nodeId) =>
    get().transitions.filter((t) => t.fromNode === nodeId || t.toNode === nodeId),

  getNodesForCurrentFloor: () => {
    const { nodes, currentBuilding, currentFloor, displayFilters } = get();
    return floorNodesOf(nodes, currentBuilding, currentFloor, displayFilters.showPortals);
  },

  getEdgesForCurrentFloor: () => {
    const { displayFilters } = get();
    if (!displayFilters.showEdges) return [];

    const nodes = get().getNodesForCurrentFloor();
    const getNode = get().getNode;
    const edges: { from: string; to: string }[] = [];
    const seen = new Set<string>();

    nodes.forEach((node) => {
      node.neighbors.forEach((neighborId) => {
        const key = edgeKey(node.id, neighborId);
        if (!seen.has(key) && getNode(neighborId)) {
          seen.add(key);
          edges.push({ from: node.id, to: neighborId });
        }
      });
    });

    return edges;
  },

  getVisibleTransitions: () => {
    const { transitions, currentBuilding, currentFloor, nodes, displayFilters } = get();
    if (!displayFilters.showTransitions) return [];

    const scope = scopeOfFloor(currentBuilding, currentFloor);

    // Переход показывается, если хотя бы один его конец попадает в текущий
    // срез: именно так на плане этажа виден выход к лестнице на другой этаж.
    return transitions.filter((t) => {
      const fromNode = nodes.get(t.fromNode);
      const toNode = nodes.get(t.toNode);
      if (!fromNode || !toNode) return false;

      return isNodeInScope(fromNode, scope) || isNodeInScope(toNode, scope);
    });
  },

  getOrphanNodes: () => get().getNodesForCurrentFloor().filter((n) => n.neighbors.length === 0),

  getNodesWithoutAlias: () => {
    const { aliases } = get();
    return get()
      .getNodesForCurrentFloor()
      .filter((n) => (aliases.get(n.id) ?? []).length === 0);
  },

  getNodesWithErrors: () => {
    const { nodes } = get();
    return get()
      .getNodesForCurrentFloor()
      .filter((n) => n.neighbors.some((nb) => !nodes.has(nb)));
  },

  /**
   * Связность графа через `findConnectedComponents` ядра.
   *
   * Собственный BFS здесь для каждого узла заново перебирал весь массив
   * переходов, то есть работал за O(N·T); на реальных объёмах данных это
   * квадратично. Ядро строит список смежности один раз в конструкторе
   * `Graph` и обходит его за линейное время.
   */
  isGraphConnected: () => findConnectedComponents(buildGraphFromState(get())),

  searchNodes: (query) => {
    const { nodes, aliases, aliasTranslations } = get();
    return searchNodeHits(query, nodes, aliases, aliasTranslations).map((hit) => hit.node);
  },
});
