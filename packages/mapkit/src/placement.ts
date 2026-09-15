import type { ImageSize } from './useImageSize.js';

/**
 * Геометрия плана, привязанного к территории кампуса (запись 31).
 *
 * Та же формула, что у проекции ядра (`createCampusProjection`):
 *
 *     world = originMeters + R(rotationDeg) · (metersPerPixel · pixel)
 *
 * — поворот по часовой стрелке при оси y, направленной вниз. Ядро переводит
 * узлы, здесь — углы и габариты картинки плана и CSS-преобразование, которое
 * ставит её на место. Функции чистые и проверены тестами: ошибка в них сдвинула
 * бы план относительно маршрута, а глазом это заметно не всегда.
 */

/** Точка территории в метрах, ось y вниз. */
export interface MeterPoint {
  x: number;
  y: number;
}

/** Привязка плана: метров в пикселе, левый верхний угол на территории, поворот. */
export interface PlanPlacement {
  metersPerPixel: number;
  originMeters: MeterPoint;
  rotationDeg: number;
}

/** Прямоугольник территории со сторонами вдоль осей, метры. */
export interface MeterExtent {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Точка плана в пикселях — на территорию, в метры. */
export function planPointToWorld(placement: PlanPlacement, x: number, y: number): MeterPoint {
  const radians = (placement.rotationDeg * Math.PI) / 180;
  const px = x * placement.metersPerPixel;
  const py = y * placement.metersPerPixel;

  return {
    x: placement.originMeters.x + px * Math.cos(radians) - py * Math.sin(radians),
    y: placement.originMeters.y + px * Math.sin(radians) + py * Math.cos(radians),
  };
}

/** Углы плана на территории по часовой стрелке от левого верхнего. */
export function planCorners(placement: PlanPlacement, size: ImageSize): MeterPoint[] {
  return [
    planPointToWorld(placement, 0, 0),
    planPointToWorld(placement, size.width, 0),
    planPointToWorld(placement, size.width, size.height),
    planPointToWorld(placement, 0, size.height),
  ];
}

/** Наименьший прямоугольник вдоль осей, содержащий точки. */
export function extentOf(points: readonly MeterPoint[]): MeterExtent {
  return {
    minX: Math.min(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxX: Math.max(...points.map((point) => point.x)),
    maxY: Math.max(...points.map((point) => point.y)),
  };
}

export function unionExtent(a: MeterExtent, b: MeterExtent): MeterExtent {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

/**
 * CSS-преобразование элемента плана размером в пиксели изображения.
 *
 * Порядок читается справа налево: масштаб пикселя плана в экранные пиксели,
 * поворот вокруг левого верхнего угла, перенос угла на его место на экране —
 * та же формула привязки. `transform-origin` элемента — `0 0`.
 *
 * @param origin левый верхний угол плана в пикселях слоя карты
 * @param screenPixelsPerMeter масштаб карты
 * @param bearingDeg угол поворота самой карты (запись 36): план поворачивается на свой угол и на него
 */
export function planTransform(
  origin: MeterPoint,
  screenPixelsPerMeter: number,
  placement: PlanPlacement,
  bearingDeg = 0
): string {
  const scale = screenPixelsPerMeter * placement.metersPerPixel;
  return `translate3d(${origin.x}px, ${origin.y}px, 0) rotate(${placement.rotationDeg + bearingDeg}deg) scale(${scale})`;
}

/** Лежит ли точка внутри многоугольника (включая границу — с точностью до вычислений). */
export function containsPoint(polygon: readonly MeterPoint[], point: MeterPoint): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (a.y > point.y !== b.y > point.y && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/** Расстояние от точки до многоугольника; внутри — ноль. */
export function distanceToPolygon(polygon: readonly MeterPoint[], point: MeterPoint): number {
  if (containsPoint(polygon, point)) return 0;

  let nearest = Number.POSITIVE_INFINITY;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    nearest = Math.min(nearest, distanceToSegment(point, polygon[j], polygon[i]));
  }
  return nearest;
}

function distanceToSegment(point: MeterPoint, a: MeterPoint, b: MeterPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}
