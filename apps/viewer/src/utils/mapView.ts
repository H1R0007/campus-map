import type { Graph, MapNode, ViewScope } from '@campus-map/core';
import { isNodeInScope, scopeOfNode } from '@campus-map/core';
import type { LatLngTuple } from './routeGeometry';
import { sameScope } from './routeFloors';

/**
 * Что сейчас показывает карта навигатора.
 *
 * - `plan` — один план (`PixelMap`, данные без привязки): территория или этаж
 *   корпуса;
 * - `canvas` — холст кампуса (`WorldMap`, запись 32): территория видна всегда,
 *   у каждого корпуса открыт свой этаж, и виден он, когда корпус приближен.
 *
 * Слои карты и панель спрашивают одно — виден ли узел или область, — и не
 * разбирают, какая карта сейчас на экране.
 */
export type MapView =
  | { kind: 'plan'; scope: ViewScope }
  | {
      kind: 'canvas';
      /** Этаж, открытый в каждом корпусе. */
      floors: ReadonlyMap<string, number>;
      /** Корпуса, приближенные настолько, что вместо крыши виден этаж. */
      revealed: ReadonlySet<string>;
    };

/** Видна ли на карте область — территория или этаж корпуса. */
export function isScopeShown(view: MapView, scope: ViewScope): boolean {
  if (view.kind === 'plan') return sameScope(view.scope, scope);
  if (scope.mode === 'campus') return true;
  return view.revealed.has(scope.buildingId) && view.floors.get(scope.buildingId) === scope.floor;
}

/** Виден ли узел на карте. */
export function isNodeShown(view: MapView, node: MapNode): boolean {
  return view.kind === 'plan' ? isNodeInScope(node, view.scope) : isScopeShown(view, scopeOfNode(node));
}

/** Узлы, видимые на карте: выборка по индексам этажей графа, без перебора всех узлов. */
export function shownNodesOf(graph: Graph, view: MapView): MapNode[] {
  if (view.kind === 'plan') {
    return [
      ...(view.scope.mode === 'campus'
        ? graph.getCampusNodes()
        : graph.getNodesForFloor(view.scope.buildingId, view.scope.floor)),
    ];
  }

  const nodes = [...graph.getCampusNodes()];
  for (const buildingId of view.revealed) {
    const floor = view.floors.get(buildingId);
    if (floor !== undefined) nodes.push(...graph.getNodesForFloor(buildingId, floor));
  }
  return nodes;
}

/**
 * Положение узла на карте: `[y, x]` в пикселях его плана или в метрах холста.
 *
 * Узел без мировой точки на холсте бывает только при ошибке данных — тогда
 * берутся пиксели, и ошибка видна на карте, а не роняет её.
 */
export function mapPointOf(graph: Graph, view: MapView, node: MapNode): LatLngTuple {
  if (view.kind === 'canvas') {
    const world = graph.getWorld(node.id);
    if (world) return [world.y, world.x];
  }
  return [node.y, node.x];
}
