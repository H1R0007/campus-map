import { CAMPUS_BUILDING_ID } from '../dataset/paths.js';
import type { Graph } from '../graph/Graph.js';
import { resolvePlanPlacement } from '../projection.js';
import type { BuildingMeta } from '../types/building.js';
import type { MapNode } from '../types/node.js';
import type { TransitionType } from '../types/transition.js';
import { normalizeDegrees } from './manifest.js';
import type { Panorama } from './types.js';

/**
 * Стрелки панорамы и виды вдоль маршрута (запись 90 в `DECISIONS.md`).
 *
 * Углы — в градусах по часовой стрелке от верха плана этажа панорамы, ось y
 * вниз, как у всех планов. На снимке угол стрелки — это её направление минус
 * `heading` панорамы: куда смотрит середина снимка.
 */

/** Стрелка с панорамы к соседней панораме. */
export interface PanoramaLink {
  /** Узел соседней панорамы — куда ведёт стрелка. */
  target: string;

  /**
   * Направление стрелки от верха плана этажа панорамы; `null` — граф его не
   * знает (лестница или лифт в одной точке плана, а `links.headings` нет).
   */
  bearing: number | null;

  /**
   * Угол стрелки на снимке: от его середины, по часовой стрелке, (−180, 180].
   * `null` — нет направления стрелки или у снимка не выставлен `heading`.
   */
  yaw: number | null;

  /** Первый переход по пути к соседу: лестница, лифт, вход; `null` — пешком по этажу. */
  transition: TransitionType | null;

  /** Длина пути по плану, метры; `null` в пиксельном режиме. */
  distanceMeters: number | null;

  /** Узлы пути от панорамы до соседа, оба конца включительно. */
  path: readonly string[];
}

export interface PanoramaLinkOptions {
  /** Дальше этого по пути стрелка не ведёт, метры (метрический режим). */
  maxMeters?: number;

  /** Дальше этого числа рёбер стрелка не ведёт — и единственный предел в пиксельном режиме. */
  maxEdges?: number;

  /**
   * Направление берётся на первую точку пути не ближе этого, метры: по
   * точке в двух шагах коридор кажется изломанным, а дверь сбоку — коридором.
   */
  aimMeters?: number;

  /**
   * Поворот плана этажа относительно территории, градусы. Нужен стрелкам,
   * которые сразу уходят на другой план (вход с улицы); без него у них нет
   * направления. См. `planRotationLookup`.
   */
  planRotation?: (building: string, floor: number) => number | null;
}

const DEFAULTS = { maxMeters: 60, maxEdges: 40, aimMeters: 3 };

/**
 * Взгляд по приходу — по последним шагам. Прицел на три метра назад у двери
 * в комнату с коридора брал точку коридора по диагонали: в деканат входят
 * на север, а взгляд выходил на 73°.
 */
const ARRIVAL_AIM_METERS = 1;

/** Вход с улицы короче этого по горизонтали направления не даёт. */
const MIN_CROSS_PLAN_METERS = 0.5;

/** Направление вектора плана: градусы по часовой стрелке от верха, ось y вниз. */
export function bearingOf(dx: number, dy: number): number {
  return normalizeDegrees((Math.atan2(dx, -dy) * 180) / Math.PI);
}

/** Угол на снимке: направление минус `heading`, в (−180, 180]. */
export function yawOnPanorama(bearing: number, heading: number): number {
  const value = normalizeDegrees(bearing - heading);
  return value > 180 ? value - 360 : value;
}

/**
 * Поворот плана каждого этажа относительно территории — по привязке из
 * метаданных. У территории поворота нет.
 */
export function planRotationLookup(
  buildingMetas: Iterable<BuildingMeta>
): (building: string, floor: number) => number | null {
  const byBuilding = new Map<string, BuildingMeta>();
  for (const meta of buildingMetas) byBuilding.set(meta.id, meta);

  return (building, floor) => {
    if (building === CAMPUS_BUILDING_ID) return 0;
    const meta = byBuilding.get(building);
    const floorMeta = meta?.floors.find((entry) => entry.floor === floor);
    if (!meta || !floorMeta) return null;
    return resolvePlanPlacement(meta, floorMeta)?.rotationDeg ?? null;
  };
}

function samePlan(a: MapNode, b: MapNode): boolean {
  return a.building === b.building && a.floor === b.floor;
}

/** Горизонтальное расстояние в метрах; `null` в пиксельном режиме. */
function metersBetween(graph: Graph, a: string, b: string): number | null {
  const pa = graph.getWorld(a);
  const pb = graph.getWorld(b);
  if (!pa || !pb) return null;
  return Math.hypot(pb.x - pa.x, pb.y - pa.y);
}

/**
 * Куда смотреть из `path[from]` вдоль пути: направление на первую точку того
 * же плана не ближе `aimMeters`, а если путь уходит с плана раньше — на
 * последнюю точку плана перед уходом.
 *
 * Если путь уходит с плана сразу (панорама стоит у самой двери на улицу),
 * направление берётся по метрам кампуса и переводится в план этажа его
 * поворотом. Лестница и лифт стоят в одной точке плана на всех этажах —
 * у них направления нет.
 *
 * @param step `1` — вперёд по пути, `-1` — назад
 */
function aimAlong(
  graph: Graph,
  path: readonly string[],
  from: number,
  step: 1 | -1,
  options: Required<Pick<PanoramaLinkOptions, 'aimMeters'>> & Pick<PanoramaLinkOptions, 'planRotation'>
): number | null {
  const origin = graph.getNode(path[from]);
  if (!origin) return null;

  let fallback: number | null = null;

  for (let index = from + step; index >= 0 && index < path.length; index += step) {
    const node = graph.getNode(path[index]);
    if (!node) return fallback;

    if (!samePlan(origin, node)) {
      if (fallback !== null) return fallback;
      return crossPlanBearing(graph, origin, node, options.planRotation);
    }

    const dx = node.x - origin.x;
    const dy = node.y - origin.y;
    if (dx === 0 && dy === 0) continue;

    const bearing = bearingOf(dx, dy);
    const meters = metersBetween(graph, origin.id, node.id);
    // В пиксельном режиме масштаба нет — годится первая несовпадающая точка.
    if (meters === null || meters >= options.aimMeters) return bearing;
    fallback = bearing;
  }

  return fallback;
}

function crossPlanBearing(
  graph: Graph,
  origin: MapNode,
  node: MapNode,
  planRotation: PanoramaLinkOptions['planRotation']
): number | null {
  const from = graph.getWorld(origin.id);
  const to = graph.getWorld(node.id);
  const rotation = planRotation?.(origin.building, origin.floor) ?? null;
  if (!from || !to || rotation === null) return null;

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.hypot(dx, dy) < MIN_CROSS_PLAN_METERS) return null;

  // Территория повёрнута относительно плана на минус его поворот.
  return normalizeDegrees(bearingOf(dx, dy) - rotation);
}

/** Длина пути по плану в метрах; `null` в пиксельном режиме. */
function pathMeters(graph: Graph, path: readonly string[]): number | null {
  let sum = 0;
  for (let index = 1; index < path.length; index++) {
    const meters = metersBetween(graph, path[index - 1], path[index]);
    if (meters === null) return null;
    sum += meters;
  }
  return sum;
}

/** Цена ребра при поиске соседей: метры кампуса, в пиксельном режиме — одно ребро. */
function edgeCost(graph: Graph, a: string, b: string): number {
  const pa = graph.getWorld(a);
  const pb = graph.getWorld(b);
  if (!pa || !pb) return 1;
  return Math.hypot(pb.x - pa.x, pb.y - pa.y, pb.z - pa.z);
}

/**
 * Стрелки с панорамы узла `nodeId`: к ближайшим панорамам по графу.
 *
 * Как в Street View, стрелка ведёт к следующему снимку, а не к соседней
 * точке графа: точек в коридоре много, снимков — по одному на 8–12 м. Поиск
 * идёт от панорамы по рёбрам и переходам кратчайшими путями и
 * останавливается на каждом узле со своей панорамой — дальше него идёт уже
 * его собственная стрелка. Так у прямого коридора со снимками A–B–C из A
 * одна стрелка вперёд, к B, а не две.
 *
 * @returns пусто, если у узла нет панорамы
 */
export function panoramaLinks(
  graph: Graph,
  panoramas: ReadonlyMap<string, Panorama>,
  nodeId: string,
  options: PanoramaLinkOptions = {}
): PanoramaLink[] {
  const panorama = panoramas.get(nodeId);
  if (!panorama || !graph.hasNode(nodeId)) return [];

  const maxMeters = options.maxMeters ?? DEFAULTS.maxMeters;
  const maxEdges = options.maxEdges ?? DEFAULTS.maxEdges;
  const aimMeters = options.aimMeters ?? DEFAULTS.aimMeters;

  // Дейкстра по небольшой окрестности: предел — десятки метров, поэтому
  // очередь — простой список с выбором минимума.
  const cost = new Map<string, number>([[nodeId, 0]]);
  const edges = new Map<string, number>([[nodeId, 0]]);
  const previous = new Map<string, string>();
  const done = new Set<string>();
  const queue: string[] = [nodeId];
  const targets: string[] = [];

  while (queue.length > 0) {
    let best = 0;
    for (let index = 1; index < queue.length; index++) {
      if (cost.get(queue[index])! < cost.get(queue[best])!) best = index;
    }
    const current = queue.splice(best, 1)[0];
    if (done.has(current)) continue;
    done.add(current);

    if (current !== nodeId && panoramas.has(current)) {
      // Чужая панорама — цель стрелки; дальше неё поиск не идёт.
      if (!panorama.hiddenLinks.has(current)) targets.push(current);
      continue;
    }

    for (const neighbor of graph.getNeighbors(current)) {
      if (done.has(neighbor)) continue;
      const nextCost = cost.get(current)! + edgeCost(graph, current, neighbor);
      const nextEdges = edges.get(current)! + 1;
      if (nextEdges > maxEdges) continue;
      if (graph.isMetric && nextCost > maxMeters) continue;
      if (nextCost < (cost.get(neighbor) ?? Infinity)) {
        cost.set(neighbor, nextCost);
        edges.set(neighbor, nextEdges);
        previous.set(neighbor, current);
        queue.push(neighbor);
      }
    }
  }

  const links = targets.map((target): PanoramaLink => {
    const path: string[] = [target];
    for (let id = previous.get(target); id !== undefined; id = previous.get(id)) path.push(id);
    path.reverse();

    const bearing =
      panorama.linkHeadings.get(target) ??
      aimAlong(graph, path, 0, 1, { aimMeters, planRotation: options.planRotation });

    return {
      target,
      bearing,
      yaw: bearing === null || panorama.heading === null ? null : yawOnPanorama(bearing, panorama.heading),
      transition: firstTransition(graph, path),
      distanceMeters: pathMeters(graph, path),
      path,
    };
  });

  return links.sort((a, b) => cost.get(a.target)! - cost.get(b.target)! || (a.target < b.target ? -1 : 1));
}

function firstTransition(graph: Graph, path: readonly string[]): TransitionType | null {
  for (let index = 1; index < path.length; index++) {
    const type = graph.getTransitionType(path[index - 1], path[index]);
    if (type !== null) return type;
  }
  return null;
}

/** Панорама на пути маршрута и куда на ней смотреть. */
export interface RoutePanoramaView {
  /** Индекс узла в `PathResult.path`. */
  pathIndex: number;

  node: string;

  /**
   * Куда идёт маршрут от этой точки, от верха плана. У последней точки —
   * куда человек шёл, подходя к ней. `null` — направления нет.
   */
  bearing: number | null;

  /** Тот же угол на снимке; `null` без `bearing` или `heading`. */
  yaw: number | null;

  /** Следующая панорама по маршруту; `null` у последней. */
  next: string | null;
}

/**
 * Панорамы вдоль маршрута — «показать этот поворот»: снимок, развёрнутый
 * туда, куда маршрут ведёт дальше.
 */
export function routePanoramaViews(
  graph: Graph,
  panoramas: ReadonlyMap<string, Panorama>,
  path: readonly string[],
  options: Pick<PanoramaLinkOptions, 'aimMeters' | 'planRotation'> = {}
): RoutePanoramaView[] {
  const aim = { aimMeters: options.aimMeters ?? DEFAULTS.aimMeters, planRotation: options.planRotation };
  const views: RoutePanoramaView[] = [];

  path.forEach((node, pathIndex) => {
    const panorama = panoramas.get(node);
    if (!panorama) return;

    let bearing = aimAlong(graph, path, pathIndex, 1, aim);
    if (bearing === null) {
      const arrival = { ...aim, aimMeters: Math.min(aim.aimMeters, ARRIVAL_AIM_METERS) };
      const back = aimAlong(graph, path, pathIndex, -1, arrival);
      bearing = back === null ? null : normalizeDegrees(back + 180);
    }

    views.push({
      pathIndex,
      node,
      bearing,
      yaw: bearing === null || panorama.heading === null ? null : yawOnPanorama(bearing, panorama.heading),
      next: null,
    });
  });

  for (let index = 0; index + 1 < views.length; index++) views[index].next = views[index + 1].node;
  return views;
}
