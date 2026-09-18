import type { MapNode } from '@campus-map/core';

/** Насколько близко к соседу нужно целиться, чтобы точка выровнялась, — пиксели экрана. */
export const SNAP_SCREEN_PX = 12;

/** Куда встанет точка и по каким соседям она выровнялась. */
export interface SnapResult {
  x: number;
  y: number;
  /** Сосед, по которому выровняли по вертикали (одна и та же x). */
  alignedX: MapNode | null;
  /** Сосед, по которому выровняли по горизонтали (одна и та же y). */
  alignedY: MapNode | null;
}

/**
 * Выравнивание новой точки по соседним точкам плана.
 *
 * Разметчик целится в дверь мышью, и точки соседних кабинетов оказываются на
 * пару пикселей выше или ниже — на плане это видно как неровный ряд, а в
 * данных даёт кривые расстояния. Сетка эту задачу не решала: двери стоят
 * там, где их начертили, а не в узлах клеток, и один и тот же шаг в пикселях
 * на разных планах означает разное расстояние (запись 41).
 *
 * Допуск задаётся в пикселях экрана и переводится в пиксели плана по
 * масштабу: на любом приближении привязка «липнет» одинаково для руки.
 *
 * @param nodes точки того же плана
 * @param scale экранных пикселей на пиксель плана (`2 ** zoom`)
 */
export function snapToNeighbours(
  nodes: readonly MapNode[],
  x: number,
  y: number,
  scale: number
): SnapResult {
  const tolerance = SNAP_SCREEN_PX / Math.max(scale, 0.0001);

  let alignedX: MapNode | null = null;
  let alignedY: MapNode | null = null;
  let bestDx = tolerance;
  let bestDy = tolerance;

  for (const node of nodes) {
    const dx = Math.abs(node.x - x);
    if (dx < bestDx) {
      bestDx = dx;
      alignedX = node;
    }

    const dy = Math.abs(node.y - y);
    if (dy < bestDy) {
      bestDy = dy;
      alignedY = node;
    }
  }

  return {
    x: alignedX ? alignedX.x : x,
    y: alignedY ? alignedY.y : y,
    alignedX,
    alignedY,
  };
}
