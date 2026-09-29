import { applySimilarity, scaleOf } from '../import/planGeometry';
import type { Similarity } from '../import/planGeometry';

/**
 * Силуэт плана (`silhouette` из `lineArt`) уменьшенной картинки: 1 — здание.
 * `scale` — сколько пикселей исходного плана в пикселе маски.
 */
export interface PlanSilhouette {
  width: number;
  height: number;
  mask: Uint8Array;
  scale: number;
}

/** Как этаж лёг на этаж входа. */
export interface SilhouetteMatch {
  /**
   * Доля меньшего силуэта, лежащая внутри большего: 1 — совпали; верхний
   * этаж меньше нижнего, но стоит на нём — тоже 1.
   */
  overlap: number;
  /** Площадь силуэта этажа к площади силуэта этажа входа. */
  areaRatio: number;
}

/**
 * Сравнивает силуэт этажа с силуэтом этажа входа (запись 67) — тем же
 * способом, каким их показывает наложение: силуэт этажа переносится его
 * привязкой в пиксели этажа входа.
 *
 * @param toBase пиксель исходного плана этажа → пиксель исходного плана этажа входа
 * @returns `null`, если у одного из планов силуэта нет (пустая картинка)
 */
export function matchSilhouettes(base: PlanSilhouette, floor: PlanSilhouette, toBase: Similarity): SilhouetteMatch | null {
  let baseCount = 0;
  for (let p = 0; p < base.mask.length; p += 1) baseCount += base.mask[p];

  let floorCount = 0;
  let hits = 0;
  for (let y = 0; y < floor.height; y += 1) {
    for (let x = 0; x < floor.width; x += 1) {
      if (!floor.mask[y * floor.width + x]) continue;
      floorCount += 1;
      const at = applySimilarity(toBase, { x: (x + 0.5) * floor.scale, y: (y + 0.5) * floor.scale });
      const bx = Math.floor(at.x / base.scale);
      const by = Math.floor(at.y / base.scale);
      if (bx >= 0 && by >= 0 && bx < base.width && by < base.height && base.mask[by * base.width + bx]) hits += 1;
    }
  }
  if (baseCount === 0 || floorCount === 0) return null;

  // Пиксель маски этажа — в пикселях маски этажа входа.
  const factor = ((floor.scale * scaleOf(toBase)) / base.scale) ** 2;
  const floorArea = floorCount * factor;
  const common = hits * factor;
  return { overlap: Math.min(1, common / Math.min(baseCount, floorArea)), areaRatio: floorArea / baseCount };
}
