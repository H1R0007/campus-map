import { normalizeDegrees } from '@campus-map/core';

/**
 * Система углов просмотрщика.
 *
 * Ядро считает направления в плане этажа панорамы. Просмотрщику нужна одна
 * система на все снимки: тогда после шага по стрелке человек смотрит туда же,
 * куда шёл, как в Street View, — даже если середины снимков смотрят в разные
 * стороны. Такая система — территория кампуса: угол 0 — верх её плана, по
 * часовой стрелке. Каждый снимок поворачивается в неё поправкой сферы
 * (`sphereCorrection.pan`): середина снимка встаёт на свой `heading` плюс
 * поворот плана этажа.
 */

export const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
export const toDegrees = (radians: number) => normalizeDegrees((radians * 180) / Math.PI);

/** Направление плана этажа — в систему территории. */
export function worldBearing(planBearing: number, planRotation: number): number {
  return normalizeDegrees(planBearing + planRotation);
}

/** Направление территории — в план этажа. */
export function planBearing(worldDegrees: number, planRotation: number): number {
  return normalizeDegrees(worldDegrees - planRotation);
}

/**
 * Куда на территории смотрит середина снимка, градусы. Поправка сферы
 * просмотрщика — этот угол с обратным знаком (см. PanoramaView).
 */
export function panOf(heading: number, planRotation: number): number {
  return worldBearing(heading, planRotation);
}

/** Угол на снимке (от его середины) по углу в системе просмотрщика. */
export function imageYaw(viewerDegrees: number, pan: number): number {
  const value = normalizeDegrees(viewerDegrees - pan);
  return value > 180 ? value - 360 : value;
}
