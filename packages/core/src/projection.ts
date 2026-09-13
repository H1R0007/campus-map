import { CAMPUS_BUILDING_ID, CAMPUS_FLOOR } from './dataset/paths.js';
import { floorKey } from './geometry.js';
import type { BuildingMeta, CampusMeta, FloorMeta } from './types/building.js';
import type { MapNode } from './types/node.js';

/**
 * Метрическое пространство кампуса.
 *
 * Координаты узла в данных — пиксели плана **своего** этажа, и у каждого
 * плана своя система: сравнивать их между этажами бессмысленно (запись 6 в
 * `DECISIONS.md`). Привязка планов к территории (`PlanPlacement`) переводит
 * все этажи в одно пространство в метрах. На нём держатся время в пути и
 * эвристика поиска, а в будущем — непрерывная карта.
 */

/**
 * Точка в пространстве кампуса.
 *
 * `x`, `y` — метры на плане территории от его левого верхнего угла, ось y
 * вниз, как на изображении; `z` — отметка над уровнем территории.
 */
export interface WorldPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * Режим датасета.
 *
 * - `metric` — привязаны территория и **каждый** этаж: стоимость маршрута в
 *   секундах, время в пути известно;
 * - `pixel` — иначе: пиксельная модель стоимости, времени в пути нет.
 *
 * Режим один на весь датасет и никогда не смешивается: у маршрута, часть
 * которого измерена в метрах, а часть в пикселях, нет ни длины, ни времени.
 */
export type MetricMode = 'metric' | 'pixel';

/** Этаж или территория, которым не хватает привязки. */
export interface UnplacedFloor {
  /** Корпус; `CAMPUS_BUILDING_ID` — территория кампуса. */
  buildingId: string;

  floor: number;

  /** Чего не хватает — в терминах полей формата данных. */
  missing: string[];
}

/** Перевод пикселей планов в пространство кампуса. */
export interface CampusProjection {
  readonly mode: MetricMode;

  /** Непривязанные этажи. Пуст ровно тогда, когда режим метрический. */
  readonly unplacedFloors: readonly UnplacedFloor[];

  /**
   * Точка узла в пространстве кампуса.
   *
   * @returns `null` в пиксельном режиме и для узла этажа, не объявленного в
   *          метаданных: частичной проекции не бывает.
   */
  toWorld(node: Pick<MapNode, 'building' | 'floor' | 'x' | 'y'>): WorldPoint | null;
}

/** Преобразование пикселей одного плана: подобие плюс отметка. */
interface PlanFrame {
  scale: number;
  cos: number;
  sin: number;
  originX: number;
  originY: number;
  z: number;
}

/** Недостающая отметка: у неё два законных источника, и назвать нужно оба. */
const MISSING_ELEVATION =
  'elevationMeters (или baseElevationMeters и floorHeightMeters у корпуса)';

/**
 * Отметка этажа по формуле корпуса: `base + (n − 1) · height`.
 */
function elevationByNumber(building: BuildingMeta, floor: number): number | undefined {
  const base = building.placement?.baseElevationMeters;
  const height = building.placement?.floorHeightMeters;

  return base !== undefined && height !== undefined ? base + (floor - 1) * height : undefined;
}

/**
 * Итоговая привязка этажа: значения этажа поверх значений корпуса.
 *
 * @returns преобразование либо список того, чего не хватает.
 */
function resolvePlanFrame(building: BuildingMeta, floor: FloorMeta): PlanFrame | string[] {
  const scale = floor.placement?.metersPerPixel ?? building.placement?.metersPerPixel;
  const origin = floor.placement?.originMeters ?? building.placement?.originMeters;
  const rotationDeg = floor.placement?.rotationDeg ?? building.placement?.rotationDeg;
  const z = floor.elevationMeters ?? elevationByNumber(building, floor.floor);

  if (scale === undefined || origin === undefined || rotationDeg === undefined || z === undefined) {
    return [
      ...(scale === undefined ? ['metersPerPixel'] : []),
      ...(origin === undefined ? ['originMeters'] : []),
      ...(rotationDeg === undefined ? ['rotationDeg'] : []),
      ...(z === undefined ? [MISSING_ELEVATION] : []),
    ];
  }

  const radians = (rotationDeg * Math.PI) / 180;

  return {
    scale,
    cos: Math.cos(radians),
    sin: Math.sin(radians),
    originX: origin.x,
    originY: origin.y,
    z,
  };
}

/**
 * Строит перевод пикселей всех планов в пространство кампуса.
 *
 * Метаданные ожидаются нормализованными загрузчиком: масштаб и высота этажа
 * положительны, все числа конечны. Здесь решается только полнота привязки.
 */
export function createCampusProjection(
  campusMeta: CampusMeta,
  buildingMetas: Iterable<BuildingMeta>
): CampusProjection {
  const frames = new Map<string, PlanFrame>();
  const unplacedFloors: UnplacedFloor[] = [];

  // Территория задаёт само пространство: без поворота и сдвига, на уровне 0.
  if (campusMeta.metersPerPixel === undefined) {
    unplacedFloors.push({
      buildingId: CAMPUS_BUILDING_ID,
      floor: CAMPUS_FLOOR,
      missing: ['metersPerPixel'],
    });
  } else {
    frames.set(floorKey(CAMPUS_BUILDING_ID, CAMPUS_FLOOR), {
      scale: campusMeta.metersPerPixel,
      cos: 1,
      sin: 0,
      originX: 0,
      originY: 0,
      z: 0,
    });
  }

  for (const building of buildingMetas) {
    for (const floor of building.floors) {
      const frame = resolvePlanFrame(building, floor);

      if (Array.isArray(frame)) {
        unplacedFloors.push({ buildingId: building.id, floor: floor.floor, missing: frame });
      } else {
        frames.set(floorKey(building.id, floor.floor), frame);
      }
    }
  }

  const mode: MetricMode = unplacedFloors.length === 0 ? 'metric' : 'pixel';

  return {
    mode,
    unplacedFloors,

    toWorld(node) {
      if (mode === 'pixel') return null;

      const frame = frames.get(floorKey(node.building, node.floor));
      if (frame === undefined) return null;

      const px = node.x * frame.scale;
      const py = node.y * frame.scale;

      // При оси y, направленной вниз, эта матрица поворачивает по часовой
      // стрелке — так же, как CSS `rotate()` с положительным углом. Точка
      // правее угла плана при повороте на 90° оказывается ниже него.
      return {
        x: frame.originX + px * frame.cos - py * frame.sin,
        y: frame.originY + px * frame.sin + py * frame.cos,
        z: frame.z,
      };
    },
  };
}
