import type { BuildingMeta, MapNode, Transition, ViewScope } from '@campus-map/core';
import { CAMPUS_BUILDING_ID, isNodeInScope } from '@campus-map/core';

/** Переход с узла текущего плана на другой план и подпись назначения. */
export interface TransitionTarget {
  transition: Transition;
  /** Куда ведёт переход: «↑ этаж 3», «Корпус Б, этаж 2», «Кампус». */
  label: string;
}

/** Отметка у узла текущего плана: переходы с него на другие планы. */
export interface TransitionMarker {
  node: MapNode;
  targets: TransitionTarget[];
}

export interface FloorTransitions {
  /** Оба конца на текущем плане — рисуются линией между узлами. */
  lines: Transition[];
  /** Второй конец на другом плане — отметкой у узла этого плана. */
  markers: TransitionMarker[];
}

/**
 * Разбирает переходы, видимые на текущем плане, на линии и отметки.
 *
 * Координаты узла — пиксели плана его этажа (запись 14), и пиксели разных
 * планов между собой не сравнимы. Раньше переход на другой этаж рисовался
 * линией к координатам узла чужого плана — отрезком через весь этаж, который
 * ни на что не указывал. Теперь такой переход — отметка у узла текущего плана
 * с планом назначения, а линия остаётся только между узлами одного плана.
 *
 * @param visible переходы, у которых хотя бы один конец на текущем плане
 *        (`getVisibleTransitions`)
 */
export function splitFloorTransitions(
  visible: readonly Transition[],
  nodes: ReadonlyMap<string, MapNode>,
  scope: ViewScope,
  buildingMetas: ReadonlyMap<string, BuildingMeta>
): FloorTransitions {
  const lines: Transition[] = [];
  const markers = new Map<string, TransitionMarker>();

  for (const transition of visible) {
    const from = nodes.get(transition.fromNode);
    const to = nodes.get(transition.toNode);
    if (!from || !to) continue;

    const fromHere = isNodeInScope(from, scope);
    const toHere = isNodeInScope(to, scope);

    if (fromHere && toHere) {
      lines.push(transition);
      continue;
    }
    if (!fromHere && !toHere) continue;

    const here = fromHere ? from : to;
    const there = fromHere ? to : from;

    let marker = markers.get(here.id);
    if (!marker) {
      marker = { node: here, targets: [] };
      markers.set(here.id, marker);
    }
    marker.targets.push({ transition, label: targetLabel(here, there, buildingMetas) });
  }

  return { lines, markers: [...markers.values()] };
}

/**
 * Подпись плана, куда ведёт переход, — относительно узла, у которого стоит
 * отметка. В своём корпусе важнее направление («↑ этаж 3»), в чужом — корпус.
 */
function targetLabel(here: MapNode, there: MapNode, buildingMetas: ReadonlyMap<string, BuildingMeta>): string {
  if (there.building === CAMPUS_BUILDING_ID) return 'Кампус';

  // Тот же корпус и тот же этаж попали бы в линии: здесь этажи разные.
  if (there.building === here.building) return `${there.floor > here.floor ? '↑' : '↓'} этаж ${there.floor}`;

  return `${buildingMetas.get(there.building)?.name ?? there.building}, этаж ${there.floor}`;
}
