import { CAMPUS_BUILDING_ID } from '@campus-map/core';
import type { AliasManager, BuildingMeta, Graph, MapNode, PanoramaLink, TransitionType } from '@campus-map/core';

/**
 * Подписи экскурсии: где снимок, куда ведёт стрелка, с какой она стороны.
 *
 * Имена из данных стоят в именительном падеже отдельно от действия — как в
 * шагах навигатора: произвольное имя в падеж не поставить.
 */

export interface DescribeContext {
  graph: Graph;
  aliases: AliasManager;
  buildingMetas: ReadonlyMap<string, BuildingMeta>;
}

/** Название места или `null`, если у узла его нет. */
export function placeName(context: DescribeContext, nodeId: string): string | null {
  return context.aliases.getPrimaryAliasForId(nodeId) ?? null;
}

/** «Территория» или «Корпус А, этаж 2». */
export function planLabel(context: DescribeContext, node: Pick<MapNode, 'building' | 'floor'>): string {
  if (node.building === CAMPUS_BUILDING_ID) return 'Территория';
  const building = context.buildingMetas.get(node.building)?.name ?? node.building;
  return `${building}, этаж ${node.floor}`;
}

const PORTAL_NAME: Record<TransitionType, string> = {
  stairs: 'Лестница',
  lift: 'Лифт',
  entrance: 'Вход',
  bridge: 'Переход',
};

/** «у лифта» — родительный падеж своих слов, не имён из данных. */
const NEAR_PORTAL: Record<TransitionType, string> = {
  stairs: 'у лестницы',
  lift: 'у лифта',
  entrance: 'у входа',
  bridge: 'у перехода',
};

/** Переход узла и узел на другом его конце, если узел — точка перехода. */
function portalOf(graph: Graph, nodeId: string): { type: TransitionType; other: string } | null {
  for (const other of graph.getNeighbors(nodeId)) {
    const type = graph.getTransitionType(nodeId, other);
    if (type !== null) return { type, other };
  }
  return null;
}

/**
 * Имя точки снимка. У точек коридора и дорожек своих названий нет, поэтому
 * по порядку: название точки; переход в ней («Лифт», «Вход — Корпус А»);
 * сосед с названием («Коридор, рядом А-101»); переход у соседа («Коридор у
 * лифта»); просто «Коридор» или «Дорожка».
 */
export function spotName(context: DescribeContext, nodeId: string): string {
  const own = placeName(context, nodeId);
  if (own !== null) return own;

  const { graph } = context;
  const node = graph.getNode(nodeId);
  const base = node?.building === CAMPUS_BUILDING_ID ? 'Дорожка' : 'Коридор';

  const portal = portalOf(graph, nodeId);
  if (portal) {
    const other = graph.getNode(portal.other);
    if (portal.type === 'entrance' && node?.building === CAMPUS_BUILDING_ID && other) {
      return `Вход — ${context.buildingMetas.get(other.building)?.name ?? other.building}`;
    }
    return PORTAL_NAME[portal.type];
  }

  const neighbors = graph.getNeighbors(nodeId).filter((id) => graph.getTransitionType(nodeId, id) === null);
  for (const neighbor of neighbors) {
    const name = placeName(context, neighbor);
    if (name !== null) return `${base}, рядом ${name}`;
  }
  for (const neighbor of neighbors) {
    const near = portalOf(graph, neighbor);
    if (near) return `${base} ${NEAR_PORTAL[near.type]}`;
  }
  return base;
}

/** Расстояние для подписи: «9 м», меньше метра — «рядом». */
export function distanceText(meters: number | null): string | null {
  if (meters === null) return null;
  if (meters < 1) return 'рядом';
  return `${Math.round(meters)} м`;
}

/** Куда ведёт стрелка — словами, без направления на снимке. */
export function linkLabel(context: DescribeContext, from: string, link: PanoramaLink): string {
  const source = context.graph.getNode(from);
  const target = context.graph.getNode(link.target);
  if (!source || !target) return link.target;

  const sameBuilding = source.building === target.building;
  const floors = target.floor - source.floor;

  if ((link.transition === 'stairs' || link.transition === 'lift') && sameBuilding && floors !== 0) {
    const how = link.transition === 'lift' ? 'На лифте' : 'По лестнице';
    return `${how} ${floors > 0 ? 'вверх' : 'вниз'} — этаж ${target.floor}`;
  }
  if (link.transition === 'entrance') {
    return target.building === CAMPUS_BUILDING_ID
      ? 'Выйти на улицу'
      : `Войти: ${context.buildingMetas.get(target.building)?.name ?? target.building}`;
  }
  if (link.transition === 'bridge' || !sameBuilding) {
    return `Переход: ${planLabel(context, target)}`;
  }
  return spotName(context, link.target);
}

/**
 * С какой стороны стрелка относительно взгляда: «впереди», «справа»,
 * «сзади», «слева». Углы — градусы по часовой стрелке.
 */
export function sideOf(linkDegrees: number, viewDegrees: number): string {
  const delta = (((linkDegrees - viewDegrees) % 360) + 540) % 360 - 180;
  if (Math.abs(delta) <= 35) return 'впереди';
  if (Math.abs(delta) >= 145) return 'сзади';
  return delta > 0 ? 'справа' : 'слева';
}
