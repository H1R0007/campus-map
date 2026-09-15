/**
 * Покадровое приближение масштаба к цели и шаг колеса — чистые функции плавной
 * камеры (`smoothCamera.tsx`, запись 33).
 */

/** Постоянная времени приближения масштаба к цели, мс: за неё проходится ~63 % пути. */
export const ZOOM_TIME_CONSTANT_MS = 70;

/** Разница масштабов, меньше которой движение закончено: глазом её не видно. */
export const ZOOM_EPSILON = 0.002;

/** Сколько пикселей прокрутки колеса — один уровень масштаба. */
export const WHEEL_PIXELS_PER_LEVEL = 260;

/** Наибольший шаг масштаба от одного события колеса, уровни. */
const MAX_WHEEL_STEP = 1.5;

/**
 * Масштаб в следующем кадре: экспоненциальное приближение к цели.
 *
 * Считается по прошедшему времени, а не по числу кадров: на медленном телефоне
 * движение той же длительности, только кадров меньше.
 */
export function approachZoom(current: number, target: number, elapsedMs: number): number {
  const next = target + (current - target) * Math.exp(-Math.max(0, elapsedMs) / ZOOM_TIME_CONSTANT_MS);
  return Math.abs(next - target) < ZOOM_EPSILON ? target : next;
}

/**
 * Изменение масштаба от события колеса: прокрутка вверх приближает.
 *
 * Строки и страницы (`deltaMode` 1 и 2 — так прокручивают Firefox и часть
 * мышей) переводятся в пиксели. Щипок на тачпаде приходит колесом с `ctrlKey`
 * и мелким шагом — без множителя жест почти не масштабировал бы.
 */
export function wheelZoomDelta(event: { deltaY: number; deltaMode: number; ctrlKey: boolean }): number {
  const pixels = event.deltaMode === 1 ? event.deltaY * 20 : event.deltaMode === 2 ? event.deltaY * 400 : event.deltaY;
  const delta = (-pixels / WHEEL_PIXELS_PER_LEVEL) * (event.ctrlKey ? 4 : 1);
  return Math.max(-MAX_WHEEL_STEP, Math.min(MAX_WHEEL_STEP, delta));
}
