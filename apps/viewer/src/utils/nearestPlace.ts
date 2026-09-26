import type {
  AliasManager,
  BuildingMeta,
  Graph,
  PathfindingOptions,
  PathResult,
  PlaceCategory,
} from '@campus-map/core';
import { CAMPUS_BUILDING_ID, findNearest, findPath, scopeOfNode } from '@campus-map/core';
import { floorText, messagesFor } from '../i18n';
import type { Language } from '../i18n/languages';
import { nodePlaceLabel } from './placeLabels';
import { EXIT_TARGET, exitNodesOf, placeIdsOfKind } from './placeKinds';
import { sameScope } from './routeFloors';
import { formatDuration } from './routeInstructions';

/** Ближайшее место категории и путь до него. */
export interface NearestPlace {
  nodeId: string;
  route: PathResult;
  /**
   * Дойти можно при выбранных ограничениях маршрута. `false` — место найдено
   * без них: например, туалет только этажом выше, а лестницы запрещены.
   */
  reachable: boolean;
}

/**
 * Ближайшее место категории от начала маршрута — для быстрых кнопок (запись 22).
 *
 * Само начало не считается: человек у туалета, нажавший «Туалет», ищет не его.
 * Если с ограничениями не дойти ни до одного места, берётся ближайшее без них:
 * обзор маршрута объяснит, что мешает, и снимет запрет лестниц одной кнопкой, —
 * это полезнее молча недоступной кнопки.
 *
 * Выход (`EXIT_TARGET`) — двери корпусов, а не отмеченные места; с территории
 * выходить некуда — тогда `null`.
 *
 * @returns `null`, если мест категории нет или ни до одного не дойти
 */
export function nearestPlaceOf(
  graph: Graph,
  aliasManager: AliasManager,
  startId: string,
  category: PlaceCategory,
  options: PathfindingOptions
): NearestPlace | null {
  if (category === EXIT_TARGET && graph.getNode(startId)?.building === CAMPUS_BUILDING_ID) return null;
  const candidates = category === EXIT_TARGET ? exitNodesOf(graph) : aliasManager.getIdsByCategory(category);
  const targets = candidates.filter((id) => id !== startId);
  if (targets.length === 0) return null;

  const restricted = findNearest(graph, startId, targets, options);
  const route = restricted.found ? restricted : findNearest(graph, startId, targets);
  if (!route.found) return null;

  return { nodeId: route.path[route.path.length - 1], route, reachable: restricted.found };
}

/** Место вида и маршрут до него от начала. */
export interface PlaceChoice {
  nodeId: string;
  route: PathResult;
}

/**
 * Все места вида от начала маршрута, ближайшее первым — «все столовые» после
 * быстрой кнопки (запись 45). Человек не всегда хочет в ближайшую: в соседнем
 * корпусе может быть та, что ему нужна.
 *
 * Места, до которых при выбранных ограничениях не дойти, не показываются:
 * выбор среди них вёл бы к «маршрут не найден».
 */
export function placesOfKind(
  graph: Graph,
  aliasManager: AliasManager,
  startId: string,
  kind: PlaceCategory,
  options: PathfindingOptions,
  limit = 20
): PlaceChoice[] {
  return placeIdsOfKind(graph, aliasManager, kind)
    .filter((id) => id !== startId)
    .map((nodeId) => ({ nodeId, route: findPath(graph, startId, nodeId, options) }))
    .filter((choice) => choice.route.found)
    .sort((a, b) => a.route.cost - b.route.cost)
    .slice(0, limit);
}

/**
 * Подсказка к быстрой кнопке: сколько идти или где это.
 *
 * С метрикой — время («~2 мин»). Без неё времени нет — выдуманное число хуже
 * отсутствующего (запись 9), — и подсказка говорит, где место: «на этом
 * этаже», этаж того же корпуса, иначе корпус и этаж.
 */
export function nearestHint(
  graph: Graph,
  buildingMetas: ReadonlyMap<string, BuildingMeta>,
  startId: string,
  place: NearestPlace,
  language: Language
): string {
  if (place.route.durationSeconds !== null) return formatDuration(place.route.durationSeconds, language);

  const start = graph.getNode(startId);
  const node = graph.getNode(place.nodeId);
  if (!start || !node) return '';

  const messages = messagesFor(language);
  if (sameScope(scopeOfNode(start), scopeOfNode(node))) return messages.quick.sameFloor;
  if (node.building === start.building && node.building !== CAMPUS_BUILDING_ID) {
    return messages.map.floor(floorText(buildingMetas, node.building, node.floor));
  }
  return nodePlaceLabel(graph, buildingMetas, node.id, language);
}
