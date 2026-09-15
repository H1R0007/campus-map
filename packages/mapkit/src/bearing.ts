import type { MeterExtent, MeterPoint } from './placement.js';

/**
 * Поворот карты — чистая геометрия, без Leaflet (запись 36).
 *
 * Угол карты (`bearing`) — на сколько градусов по часовой стрелке повёрнуто
 * содержимое на экране. Ось y направлена вниз, как у всех карт mapkit, поэтому
 * положительный угол в формуле поворота — поворот по часовой.
 */

/** Двумя пальцами поворот начинается, когда угол между ними изменился на столько, градусов: щипок не вращает карту. */
export const ROTATE_THRESHOLD_DEG = 12;

/** Ближе к северу, чем на столько градусов, карта по окончании жеста встаёт ровно на север. */
export const NORTH_SNAP_DEG = 7;

/** Угол в пределах (-180, 180]. */
export function normalizeBearing(degrees: number): number {
  const turned = ((((degrees + 180) % 360) + 360) % 360) - 180;
  return turned === -180 ? 180 : turned;
}

/** Кратчайший поворот от угла `from` к углу `to`, градусы в пределах (-180, 180]. */
export function angleDelta(from: number, to: number): number {
  return normalizeBearing(to - from);
}

/** Точка, повёрнутая вокруг `pivot` на `degrees` по часовой стрелке (ось y вниз). */
export function rotateAround(point: MeterPoint, pivot: MeterPoint, degrees: number): MeterPoint {
  if (degrees === 0) return { x: point.x, y: point.y };
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = point.x - pivot.x;
  const dy = point.y - pivot.y;
  return { x: pivot.x + dx * cos - dy * sin, y: pivot.y + dx * sin + dy * cos };
}

/** Габарит прямоугольника `extent`, повёрнутого вокруг `pivot`: по всем четырём углам. */
export function rotatedExtent(extent: MeterExtent, pivot: MeterPoint, degrees: number): MeterExtent {
  const corners = [
    { x: extent.minX, y: extent.minY },
    { x: extent.maxX, y: extent.minY },
    { x: extent.maxX, y: extent.maxY },
    { x: extent.minX, y: extent.maxY },
  ].map((corner) => rotateAround(corner, pivot, degrees));
  return {
    minX: Math.min(...corners.map((corner) => corner.x)),
    minY: Math.min(...corners.map((corner) => corner.y)),
    maxX: Math.max(...corners.map((corner) => corner.x)),
    maxY: Math.max(...corners.map((corner) => corner.y)),
  };
}

/** Направление от касания `a` к касанию `b` на экране, градусы. */
export function touchAngle(a: MeterPoint, b: MeterPoint): number {
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}

/** Угол по окончании жеста: у самого севера — ровно север. */
export function settledBearing(degrees: number): number {
  const bearing = normalizeBearing(degrees);
  return Math.abs(bearing) < NORTH_SNAP_DEG ? 0 : bearing;
}
