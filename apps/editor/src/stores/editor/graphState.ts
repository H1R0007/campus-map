import { Graph, createCampusProjection } from '@campus-map/core';
import type {
  AliasEntry,
  BuildingMeta,
  CampusMeta,
  Dataset,
  MapNode,
  PathResult,
  PlaceCategory,
  PlaceKind,
  Transition,
} from '@campus-map/core';
import type { NeighborSnapshot } from '../historyStore';

/**
 * Общие помощники срезов стора: слепки соседей для отмены и сборка графа
 * ядра из состояния редактора.
 */

/** Слепок списков соседей перечисленных узлов — для отмены действия. */
export function snapshotNeighbors(nodes: ReadonlyMap<string, MapNode>, ids: Iterable<string>): NeighborSnapshot {
  const snap: NeighborSnapshot = {};
  for (const id of ids) {
    const n = nodes.get(id);
    if (n) snap[id] = [...n.neighbors];
  }
  return snap;
}

/** Возвращает соседей узлов к слепку. Узлы, которых уже нет, пропускаются. */
export function applyNeighborsSnapshot(nodes: Map<string, MapNode>, snap: NeighborSnapshot): void {
  for (const id of Object.keys(snap)) {
    const n = nodes.get(id);
    if (n) n.neighbors = [...snap[id]];
  }
}

/**
 * Собирает граф из текущего состояния редактора.
 *
 * `Graph` в ядре неизменяемый и строит все индексы (по этажу, по ключу ребра,
 * список смежности) один раз в конструкторе, поэтому перед каждым поиском
 * пути создаётся новый экземпляр. Копировать узлы при этом не нужно: граф их
 * только читает, а владеет ими редактор.
 *
 * Граф собирается вместе с привязкой планов к метрике кампуса: симулятор
 * обязан строить тот же маршрут, что увидит студент, а в метрическом режиме
 * модель стоимости другая — секунды вместо пикселей.
 */
export function buildGraphFromState(state: {
  nodes: ReadonlyMap<string, MapNode>;
  transitions: readonly Transition[];
  campusMeta: CampusMeta | null;
  buildingMetas: ReadonlyMap<string, BuildingMeta>;
}): Graph {
  const projection =
    state.campusMeta === null
      ? undefined
      : createCampusProjection(state.campusMeta, state.buildingMetas.values());

  return new Graph(state.nodes.values(), state.transitions, projection);
}

/** Состояние редактора, из которого собирается датасет. */
export interface DatasetState {
  nodes: ReadonlyMap<string, MapNode>;
  transitions: readonly Transition[];
  buildingMetas: ReadonlyMap<string, BuildingMeta>;
  aliases: ReadonlyMap<string, string[]>;
  aliasTranslations: ReadonlyMap<string, NonNullable<AliasEntry['translations']>>;
  aliasCategories: ReadonlyMap<string, PlaceCategory>;
  placeKinds: PlaceKind[];
  campusMeta: CampusMeta | null;
}

/**
 * Датасет из состояния редактора — то, что уходит в файлы и в черновик.
 *
 * Названия собираются обратно в записи алиасов вместе с переводами и
 * категориями, которые редактор пока не правит, но обязан сохранить: поле,
 * которого нет в сборке, потерялось бы при первом же сохранении.
 */
export function datasetFromState(state: DatasetState): Dataset {
  const aliases: AliasEntry[] = [...state.aliases.entries()]
    // Названия удалённых узлов не сохраняются.
    .filter(([id]) => state.nodes.has(id))
    .map(([id, names]) => ({
      id,
      names: [...names],
      translations: state.aliasTranslations.get(id),
      category: state.aliasCategories.get(id),
    }));

  return {
    campusMeta: state.campusMeta ?? { buildings: [], mapSize: { width: 1200, height: 800 } },
    buildingMetas: [...state.buildingMetas.values()],
    nodes: [...state.nodes.values()].map((node) => ({ ...node, neighbors: [...node.neighbors] })),
    transitions: state.transitions.map((transition) => ({ ...transition })),
    aliases,
    placeKinds: state.placeKinds.map((kind) => ({ ...kind })),
  };
}

/**
 * Маршрут, выбранный в симуляторе.
 *
 * Правило выбора было скопировано трижды — в подсветке узлов, в линии
 * маршрута и в таймере анимации.
 */
export function selectedRoute(simulation: {
  routes: readonly PathResult[];
  selectedPathIndex: number;
}): PathResult | undefined {
  return simulation.routes[simulation.selectedPathIndex] ?? simulation.routes[0];
}
