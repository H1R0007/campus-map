import { CAMPUS_BUILDING_ID, CAMPUS_FLOOR, distance } from '@campus-map/core';
import type { MapNode, TransitionType } from '@campus-map/core';
import { planPrefix, rebaseNodeId, uniqueNodeId } from '../../utils/nodeIds';
import { snapToNeighbours } from '../../utils/snapping';
import type { SnapResult } from '../../utils/snapping';
import { useCursorStore } from '../cursorStore';
import { floorNodesOf } from './dataSlice';
import type { EditorStore } from './types';

/**
 * Куда и под каким id встают новые точки — общее для правки графа,
 * постановки по видам и буфера обмена.
 */

/** План, на котором окажется точка: у территории оба поля `null`. */
export interface PlanRef {
  building: string | null;
  floor: number | null;
}

/** Что нужно знать о плане, чтобы решить, куда встанет точка по щелчку. */
type PlacementState = Pick<
  EditorStore,
  'nodes' | 'currentBuilding' | 'currentFloor' | 'displayFilters' | 'gridSettings' | 'snapToGrid'
>;

/**
 * Куда встанет точка по щелчку: выравнивание по соседям, затем сетка.
 *
 * Одна функция на подсказку и на постановку: призрак на карте обязан
 * показывать ровно то место, куда точка встанет. Если сетка увела точку с
 * линии соседа, линия выравнивания не показывается — ряда уже нет.
 */
export function placementPoint(state: PlacementState, x: number, y: number, align = true): SnapResult {
  const aligned = alignToPlan(state, x, y, align);
  const px = Math.round(state.snapToGrid(aligned.x));
  const py = Math.round(state.snapToGrid(aligned.y));
  return {
    x: px,
    y: py,
    alignedX: aligned.alignedX && aligned.alignedX.x === px ? aligned.alignedX : null,
    alignedY: aligned.alignedY && aligned.alignedY.y === py ? aligned.alignedY : null,
  };
}

export function alignToPlan(
  state: Pick<EditorStore, 'nodes' | 'currentBuilding' | 'currentFloor' | 'displayFilters' | 'gridSettings'>,
  x: number,
  y: number,
  enabled = true
): SnapResult {
  if (!enabled || !state.gridSettings.alignToNeighbours) {
    return { x, y, alignedX: null, alignedY: null };
  }

  const scale = 2 ** (useCursorStore.getState().zoom ?? 0);
  const planNodes = floorNodesOf(state.nodes, state.currentBuilding, state.currentFloor, state.displayFilters.showPortals);
  return snapToNeighbours(planNodes, x, y, scale);
}

/**
 * Ближайшая точка того же плана — к ней кисть цепляет новую.
 *
 * Ищется по плану, а не по всему датасету: иначе дверь цеплялась бы к точке
 * этажом выше, и маршрут проходил бы сквозь перекрытие.
 */
export function nearestNodeOnPlan(nodes: Map<string, MapNode>, node: MapNode): MapNode | null {
  let best: MapNode | null = null;
  let bestAway = Number.POSITIVE_INFINITY;

  for (const other of nodes.values()) {
    if (other.id === node.id || other.building !== node.building || other.floor !== node.floor) continue;
    const away = distance(node, other);
    if (away < bestAway) {
      best = other;
      bestAway = away;
    }
  }

  return best;
}

/**
 * Раздаёт id новым точкам набора.
 *
 * Пока набор не положен в состояние, `nodes` о нём не знает, поэтому занятость
 * проверяется и по уже выданным id: иначе две копии подряд получили бы один id
 * и вторая затёрла бы первую.
 */
export function idMinter(nodes: Map<string, MapNode>) {
  const used = new Set<string>();
  /** `source` — точка, с которой снята копия, или `null` у точки без прошлого. */
  return (source: Pick<MapNode, 'id' | 'building' | 'floor'> | null, to: PlanRef): string => {
    const toPrefix = planPrefix(to.building, to.floor);
    const base =
      source === null ? `${toPrefix}_node` : rebaseNodeId(source.id, planPrefix(source.building, source.floor), toPrefix);
    const id = uniqueNodeId(base, (candidate) => nodes.has(candidate) || used.has(candidate));
    used.add(id);
    return id;
  };
}

/**
 * Переходы, которые ставятся стопкой — сразу на всех этажах корпуса. Лестницы
 * и лифты на планах стоят друг под другом. Вход и переход между корпусами
 * соединяют разные места, их владелец просил ставить руками.
 */
export const STACK_TRANSITIONS: readonly TransitionType[] = ['stairs', 'lift'];

/**
 * План, на который встают новые точки. Корпус без этажей плана не открывает —
 * на карте тогда территория, и точка встаёт на неё, а не в корпус без этажа.
 */
export function openPlanOf(st: Pick<EditorStore, 'currentBuilding' | 'currentFloor'>): { building: string; floor: number } {
  return st.currentBuilding === null || st.currentFloor === null
    ? { building: CAMPUS_BUILDING_ID, floor: CAMPUS_FLOOR }
    : { building: st.currentBuilding, floor: st.currentFloor };
}
