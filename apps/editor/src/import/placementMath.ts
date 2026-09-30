import type { MapSize, PlanPlacement } from '@campus-map/core';
import { applySimilarity, composeSimilarity, rotationOf, scaleOf } from './planGeometry';
import type { Point, Similarity } from './planGeometry';

/**
 * Постановка плана на территорию (запись 50).
 *
 * В данных привязка — метры: `world = originMeters + R(rotationDeg) ·
 * (metersPerPixel · pixel)`. На экране редактора территория — картинка в
 * своих пикселях, `world = campusPixel · campusMetersPerPixel`. Поэтому
 * постановка на экране — подобие «пиксель плана → пиксель территории», и
 * переход между ними — только умножение на масштаб территории.
 */

/** Подобие «пиксель плана → пиксель территории» по привязке из данных. */
export function frameOf(placement: Required<Pick<PlanPlacement, 'metersPerPixel' | 'originMeters' | 'rotationDeg'>>, campusMetersPerPixel: number): Similarity {
  const radians = (placement.rotationDeg * Math.PI) / 180;
  const scale = placement.metersPerPixel / campusMetersPerPixel;
  return {
    a: scale * Math.cos(radians),
    b: scale * Math.sin(radians),
    tx: placement.originMeters.x / campusMetersPerPixel,
    ty: placement.originMeters.y / campusMetersPerPixel,
  };
}

/** Привязка для данных по подобию на экране. */
export function placementOf(frame: Similarity, campusMetersPerPixel: number): Required<Pick<PlanPlacement, 'metersPerPixel' | 'originMeters' | 'rotationDeg'>> {
  const round = (value: number, digits: number) => Math.round(value * 10 ** digits) / 10 ** digits;
  return {
    metersPerPixel: round(scaleOf(frame) * campusMetersPerPixel, 7),
    originMeters: { x: round(frame.tx * campusMetersPerPixel, 3), y: round(frame.ty * campusMetersPerPixel, 3) },
    rotationDeg: round(rotationOf(frame), 3),
  };
}

/**
 * Первая постановка: план посередине того, что видно, шириной в треть
 * видимого, без поворота. Дальше человек двигает его сам.
 */
export function initialFrame(planSize: MapSize, view: { center: Point; width: number }): Similarity {
  const scale = (view.width / 3) / Math.max(planSize.width, planSize.height);
  return {
    a: scale,
    b: 0,
    tx: view.center.x - (planSize.width * scale) / 2,
    ty: view.center.y - (planSize.height * scale) / 2,
  };
}

/** Центр плана на территории. */
export function frameCenter(frame: Similarity, planSize: MapSize): Point {
  return applySimilarity(frame, { x: planSize.width / 2, y: planSize.height / 2 });
}

/** Сдвиг на территории. */
export function moveFrame(frame: Similarity, dx: number, dy: number): Similarity {
  return { ...frame, tx: frame.tx + dx, ty: frame.ty + dy };
}

/** Поворот вокруг точки территории на угол по часовой, градусы. */
export function rotateFrame(frame: Similarity, pivot: Point, degrees: number): Similarity {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const turn: Similarity = { a: cos, b: sin, tx: pivot.x - (cos * pivot.x - sin * pivot.y), ty: pivot.y - (sin * pivot.x + cos * pivot.y) };
  return composeSimilarity(turn, frame);
}

/** Масштаб вокруг точки территории. */
export function scaleFrame(frame: Similarity, pivot: Point, factor: number): Similarity {
  const zoom: Similarity = { a: factor, b: 0, tx: pivot.x * (1 - factor), ty: pivot.y * (1 - factor) };
  return composeSimilarity(zoom, frame);
}

/**
 * Булавка (запись 63): план доворачивают вокруг приколотой точки — как лист
 * на столе, прижатый пальцем. Взятую точку плана ведут к её месту: план
 * поворачивается вокруг булавки, а если масштаб неизвестен — ещё и
 * растягивается, так что взятая точка идёт ровно за курсором.
 *
 * @param start план и взятая точка (на территории) в начале перетаскивания
 * @param pin где стоит булавка, пиксели территории
 * @param now где курсор сейчас
 * @param allowScale растягивать ли: нет, если масштаб известен по чертежу
 */
export function turnAroundPin(start: { frame: Similarity; at: Point }, pin: Point, now: Point, allowScale: boolean): Similarity {
  const before = { x: start.at.x - pin.x, y: start.at.y - pin.y };
  const after = { x: now.x - pin.x, y: now.y - pin.y };
  const from = Math.hypot(before.x, before.y);
  const to = Math.hypot(after.x, after.y);
  if (from < 1e-9 || to < 1e-9) return start.frame;
  const degrees = ((Math.atan2(after.y, after.x) - Math.atan2(before.y, before.x)) * 180) / Math.PI;
  const turned = rotateFrame(start.frame, pin, degrees);
  return allowScale ? scaleFrame(turned, pin, to / from) : turned;
}

/** Угол плана, дальний от точки территории: за него удобно доворачивать вокруг булавки. */
export function farCorner(frame: Similarity, planSize: MapSize, from: Point): Point {
  const corners = [
    { x: 0, y: 0 },
    { x: planSize.width, y: 0 },
    { x: planSize.width, y: planSize.height },
    { x: 0, y: planSize.height },
  ].map((corner) => applySimilarity(frame, corner));
  return corners.reduce((best, corner) =>
    Math.hypot(corner.x - from.x, corner.y - from.y) > Math.hypot(best.x - from.x, best.y - from.y) ? corner : best
  );
}

/** Тот же план с заданными масштабом и поворотом — центр на месте: для полей ввода. */
export function withScaleAndRotation(frame: Similarity, planSize: MapSize, scale: number, degrees: number): Similarity {
  const center = frameCenter(frame, planSize);
  const radians = (degrees * Math.PI) / 180;
  const next = { a: scale * Math.cos(radians), b: scale * Math.sin(radians), tx: 0, ty: 0 };
  const moved = applySimilarity(next, { x: planSize.width / 2, y: planSize.height / 2 });
  return { ...next, tx: center.x - moved.x, ty: center.y - moved.y };
}

/** Привязка как подобие «пиксель плана → метры территории». */
export function worldOf(placement: Required<Pick<PlanPlacement, 'metersPerPixel' | 'originMeters' | 'rotationDeg'>>): Similarity {
  return frameOf(placement, 1);
}

/** Подобие «пиксель плана → метры» как привязка для данных. */
export function placementOfWorld(world: Similarity): Required<Pick<PlanPlacement, 'metersPerPixel' | 'originMeters' | 'rotationDeg'>> {
  return placementOf(world, 1);
}

/**
 * Масштаб территории изменился: привязки корпусов пересчитываются так, чтобы
 * корпуса остались на тех же местах картинки территории.
 */
export function rescalePlacement<T extends PlanPlacement>(placement: T, ratio: number): T {
  return {
    ...placement,
    ...(placement.metersPerPixel !== undefined ? { metersPerPixel: placement.metersPerPixel * ratio } : {}),
    ...(placement.originMeters !== undefined
      ? { originMeters: { x: placement.originMeters.x * ratio, y: placement.originMeters.y * ratio } }
      : {}),
  };
}
