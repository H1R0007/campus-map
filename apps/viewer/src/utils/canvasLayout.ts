import type { BuildingMeta, CampusMeta, Graph, PlanFormat } from '@campus-map/core';
import { campusMapUrl, floorMapUrl, planFormatOf, resolvePlanPlacement } from '@campus-map/core';
// Геометрия — из отдельной точки входа mapkit: без Leaflet, которому нужен браузер.
import { extentOf, planCorners, unionExtent } from '@campus-map/mapkit/placement';
import type { MeterExtent, MeterPoint, PlanPlacement } from '@campus-map/mapkit/placement';
import type { ImageSize } from '@campus-map/mapkit';
import { entranceFloorOf } from '../stores/mapStore';

/**
 * Раскладка холста кампуса: какой план где стоит (запись 32).
 *
 * Считается из метаданных один раз на датасет. Контур корпуса — план его
 * входного этажа на территории: по контуру рисуется крыша, решается, приближен
 * ли корпус и к какому корпусу приближена камера.
 */

export interface CanvasPlan {
  url: string;
  format: PlanFormat;
  placement: PlanPlacement;
  /** Размер из метаданных; без него план ставится по размеру самого файла. */
  size: ImageSize | undefined;
}

export interface CanvasBuilding {
  id: string;
  floors: ReadonlyMap<number, CanvasPlan>;
  /** Контур на территории, метры: углы плана входного этажа или охват его узлов. */
  footprint: MeterPoint[];
  /** Длинная сторона контура, метры: по ней видно, насколько корпус приближен. */
  span: number;
}

export interface CanvasLayout {
  /** План территории; `null`, если у территории нет масштаба. */
  campus: CanvasPlan | null;
  buildings: CanvasBuilding[];
  /** Территория с корпусами — по ней вид подгоняется целиком. */
  extent: MeterExtent;
}

const distance = (a: MeterPoint, b: MeterPoint) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Контур этажа: углы плана, если размер плана известен, иначе прямоугольник
 * вокруг узлов этажа — корпус остаётся на холсте и без `mapSize`.
 */
function footprintOf(graph: Graph, buildingId: string, floor: number, plan: CanvasPlan | undefined): MeterPoint[] | null {
  if (plan?.size) return planCorners(plan.placement, plan.size);

  const points: MeterPoint[] = [];
  for (const node of graph.getNodesForFloor(buildingId, floor)) {
    const world = graph.getWorld(node.id);
    if (world) points.push({ x: world.x, y: world.y });
  }
  if (points.length === 0) return null;

  const { minX, minY, maxX, maxY } = extentOf(points);
  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
}

export function canvasLayoutOf(
  graph: Graph,
  campusMeta: CampusMeta,
  buildingMetas: ReadonlyMap<string, BuildingMeta>,
  baseUrl: string
): CanvasLayout {
  const campusFormat = planFormatOf(campusMeta);
  const campus: CanvasPlan | null =
    campusMeta.metersPerPixel === undefined
      ? null
      : {
          url: campusMapUrl(baseUrl, campusFormat),
          format: campusFormat,
          placement: { metersPerPixel: campusMeta.metersPerPixel, originMeters: { x: 0, y: 0 }, rotationDeg: 0 },
          size: campusMeta.mapSize,
        };

  let extent: MeterExtent | null = campus?.size ? extentOf(planCorners(campus.placement, campus.size)) : null;
  const buildings: CanvasBuilding[] = [];

  for (const meta of buildingMetas.values()) {
    const floors = new Map<number, CanvasPlan>();
    for (const floorMeta of meta.floors) {
      const placement = resolvePlanPlacement(meta, floorMeta);
      if (placement === null) continue;

      const format = planFormatOf(floorMeta);
      floors.set(floorMeta.floor, {
        url: floorMapUrl(meta.id, floorMeta.floor, baseUrl, format),
        format,
        placement: {
          metersPerPixel: placement.metersPerPixel,
          originMeters: placement.originMeters,
          rotationDeg: placement.rotationDeg,
        },
        size: floorMeta.mapSize,
      });
    }

    const entrance = entranceFloorOf(meta);
    const footprint = footprintOf(graph, meta.id, entrance, floors.get(entrance));
    if (footprint === null) continue;

    const span = Math.max(distance(footprint[0], footprint[1]), distance(footprint[1], footprint[2]));
    buildings.push({ id: meta.id, floors, footprint, span });
    extent = extent === null ? extentOf(footprint) : unionExtent(extent, extentOf(footprint));
  }

  return { campus, buildings, extent: extent ?? { minX: 0, minY: 0, maxX: 1, maxY: 1 } };
}
