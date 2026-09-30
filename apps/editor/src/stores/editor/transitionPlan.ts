import { CAMPUS_BUILDING_ID, resolvePlanPlacement } from '@campus-map/core';
import type { MapNode, TransitionType } from '@campus-map/core';
import { applySimilarity, invertSimilarity } from '../../import/planGeometry';
import type { Point, Similarity } from '../../import/planGeometry';
import { frameCenter, frameOf } from '../../import/placementMath';
import { openingFloorOf } from './viewSlice';
import { existingPlan } from './windowSlice';
import type { PlanRef } from './windowSlice';
import type { EditorStore } from './types';

type Source = Pick<EditorStore, 'nodes' | 'transitions' | 'buildingMetas' | 'campusMeta'>;

interface PlacedBuilding {
  id: string;
  /** Пиксели плана этажа входа → пиксели территории. */
  frame: Similarity;
  width: number;
  height: number;
}

/** Корпуса, поставленные на территорию, — по этажу входа. */
function placedBuildings(st: Source): PlacedBuilding[] {
  const campusMpp = st.campusMeta?.metersPerPixel;
  if (campusMpp === undefined) return [];
  return [...st.buildingMetas.values()].flatMap((meta) => {
    const floor = openingFloorOf(meta);
    const floorMeta = meta.floors.find((item) => item.floor === floor);
    const placement = floorMeta ? resolvePlanPlacement(meta, floorMeta) : null;
    const size = floorMeta?.mapSize;
    return placement && size ? [{ id: meta.id, frame: frameOf(placement, campusMpp), width: size.width, height: size.height }] : [];
  });
}

const centerOf = (building: PlacedBuilding): Point =>
  frameCenter(building.frame, { width: building.width, height: building.height });

/** Корпус, в контуре которого точка территории, или ближайший к ней. */
function buildingNear(st: Source, point: Point): string | null {
  const placed = placedBuildings(st);
  const inside = placed.find((building) => {
    const local = applySimilarity(invertSimilarity(building.frame), point);
    return local.x >= 0 && local.y >= 0 && local.x <= building.width && local.y <= building.height;
  });
  if (inside) return inside.id;

  let nearest: string | null = null;
  let best = Infinity;
  for (const building of placed) {
    const center = centerOf(building);
    const distance = Math.hypot(center.x - point.x, center.y - point.y);
    if (distance < best) {
      best = distance;
      nearest = building.id;
    }
  }
  return nearest ?? st.buildingMetas.keys().next().value ?? null;
}

/** Ближайший к корпусу другой корпус — по центрам на территории, иначе первый по списку. */
function neighbourBuilding(st: Source, id: string): string | null {
  const placed = placedBuildings(st);
  const own = placed.find((building) => building.id === id);
  if (own) {
    const center = centerOf(own);
    const others = placed
      .filter((building) => building.id !== id)
      .map((building) => ({ id: building.id, distance: Math.hypot(centerOf(building).x - center.x, centerOf(building).y - center.y) }))
      .sort((a, b) => a.distance - b.distance);
    if (others.length > 0) return others[0].id;
  }
  return [...st.buildingMetas.keys()].find((other) => other !== id) ?? null;
}

/** Этажи, с которыми точка уже связана переходами этого типа. */
function linkedFloors(st: Source, node: MapNode, type: TransitionType): Set<number> {
  const floors = new Set<number>();
  for (const transition of st.transitions) {
    if (transition.type !== type) continue;
    const otherId = transition.fromNode === node.id ? transition.toNode : transition.toNode === node.id ? transition.fromNode : null;
    const other = otherId === null ? undefined : st.nodes.get(otherId);
    if (other && other.building === node.building) floors.add(other.floor);
  }
  return floors;
}

/**
 * Где обычно второй конец перехода от этой точки (запись 66) — его открывает
 * соседняя карта:
 * - вход: с этажа — территория, с территории — этаж входа корпуса, в контуре
 *   которого точка (или ближайшего);
 * - лестница и лифт: соседний этаж, ещё не связанный с точкой, — сначала выше;
 * - переход между корпусами: ближайший корпус, этаж с тем же номером.
 *
 * @returns `null`, когда подсказать нечего: например, лестница с территории
 */
export function suggestTransitionPlan(st: Source, nodeId: string, type: TransitionType): PlanRef | null {
  const node = st.nodes.get(nodeId);
  if (!node) return null;
  const onTerritory = node.building === CAMPUS_BUILDING_ID;

  switch (type) {
    case 'entrance': {
      if (!onTerritory) return { building: null, floor: null };
      const building = buildingNear(st, node);
      return building === null ? null : existingPlan(st.buildingMetas, { building, floor: null });
    }

    case 'stairs':
    case 'lift': {
      if (onTerritory) return null;
      const floors = (st.buildingMetas.get(node.building)?.floors ?? []).map((item) => item.floor).sort((a, b) => a - b);
      const index = floors.indexOf(node.floor);
      if (index < 0) return null;
      const around = [floors[index + 1], floors[index - 1]].filter((floor): floor is number => floor !== undefined);
      const linked = linkedFloors(st, node, type);
      const floor = around.find((item) => !linked.has(item)) ?? around[0];
      return floor === undefined ? null : { building: node.building, floor };
    }

    case 'bridge': {
      const from = onTerritory ? buildingNear(st, node) : node.building;
      const other = from === null ? null : onTerritory ? from : neighbourBuilding(st, from);
      if (other === null) return null;
      return existingPlan(st.buildingMetas, { building: other, floor: onTerritory ? null : node.floor });
    }
  }
}
