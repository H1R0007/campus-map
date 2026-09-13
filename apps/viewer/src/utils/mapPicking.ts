import type { MapNode } from '@campus-map/core';

/** Точка на экране, CSS-пиксели от левого верхнего угла карты. */
export interface ScreenPoint {
  x: number;
  y: number;
}

/**
 * Узел, которого пользователь коснулся на карте.
 *
 * Палец закрывает десятки пикселей, поэтому ищется ближайший узел в радиусе
 * касания, а не узел точно под точкой. Расстояние считается в экранных
 * пикселях: радиус касания одинаков при любом масштабе плана.
 *
 * Выбрать можно не каждый узел: коридор без названия студенту нечего
 * показать, и маршрут к нему не построить из интерфейса. Какие узлы
 * выбираемы, решает вызывающая сторона (`isPickable`).
 *
 * @returns ближайший выбираемый узел в радиусе; при равном расстоянии —
 *          первый по порядку кандидатов; `null`, если в радиусе никого нет
 */
export function pickNode(
  candidates: readonly MapNode[],
  isPickable: (node: MapNode) => boolean,
  toScreen: (node: MapNode) => ScreenPoint,
  tap: ScreenPoint,
  radius: number
): MapNode | null {
  let best: MapNode | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const node of candidates) {
    if (!isPickable(node)) continue;

    const point = toScreen(node);
    const distance = Math.hypot(point.x - tap.x, point.y - tap.y);

    if (distance <= radius && distance < bestDistance) {
      best = node;
      bestDistance = distance;
    }
  }

  return best;
}
