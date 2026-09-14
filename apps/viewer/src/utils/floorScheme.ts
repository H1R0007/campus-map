import type { Graph, PathResult } from '@campus-map/core';

/** Роль этажа в маршруте: начало, цель, то и другое сразу или этаж по пути. */
export type FloorRole = 'start' | 'end' | 'both' | 'pass';

/** Переход маршрута между этажами одного корпуса. */
export interface FloorLink {
  upper: number;
  lower: number;
  type: 'stairs' | 'lift';
}

export interface FloorScheme {
  floors: ReadonlyMap<number, FloorRole>;
  links: readonly FloorLink[];
}

/**
 * Схема маршрута в корпусе для колонки этажей: через какие этажи он идёт, где
 * начинается и кончается и чем человек переходит с этажа на этаж.
 *
 * «Начало» и «цель» — только если конец маршрута в этом корпусе: у маршрута с
 * территории первый этаж корпуса — этаж по пути. Этажи других корпусов не
 * учитываются: номер этажа имеет смысл только внутри своего здания.
 */
export function routeFloorScheme(graph: Graph, route: PathResult, buildingId: string): FloorScheme {
  const floors = new Map<number, FloorRole>();
  const links: FloorLink[] = [];
  if (!route.found || route.path.length === 0) return { floors, links };

  for (const nodeId of route.path) {
    const node = graph.getNode(nodeId);
    if (node?.building === buildingId && !floors.has(node.floor)) floors.set(node.floor, 'pass');
  }

  const first = graph.getNode(route.path[0]);
  const last = graph.getNode(route.path[route.path.length - 1]);
  if (last?.building === buildingId) floors.set(last.floor, 'end');
  if (first?.building === buildingId) {
    floors.set(first.floor, floors.get(first.floor) === 'end' ? 'both' : 'start');
  }

  for (const segment of route.segments ?? []) {
    const type = segment.transitionType;
    if (type !== 'stairs' && type !== 'lift') continue;

    const from = graph.getNode(segment.fromNode);
    const to = graph.getNode(segment.toNode);
    if (!from || !to || from.building !== buildingId || to.building !== buildingId || from.floor === to.floor) continue;

    const upper = Math.max(from.floor, to.floor);
    const lower = Math.min(from.floor, to.floor);
    if (!links.some((link) => link.upper === upper && link.lower === lower)) links.push({ upper, lower, type });
  }

  return { floors, links };
}
