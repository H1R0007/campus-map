import { traceBuildingOutline } from './outline';
import type { OutlinePoint } from './outline';
import type { ImportSheet } from './readers';
import type { Box } from './trim';

/** Длинная сторона области при поиске контура, px. */
const TRACE_SIDE = 1400;
/**
 * Щель, которую поиск заклеивает, — половина её ширины на местности, м: дверь
 * в 1–1,2 м закрывается, а заголовок листа в двух метрах от стены — уже нет.
 */
const GAP_METERS = 0.6;

/**
 * Контур здания на листе (записи 73 и 81): область листа рисуется в
 * 1400 px по длинной стороне, на картинке ищется силуэт, вершины
 * возвращаются в единицы листа.
 *
 * Щель между стенами, которую поиск заклеивает (двери), — по масштабу
 * чертежа, если он известен: 1,8 % листа на целом листе — это метр и больше,
 * и заголовок «Корпус А. План 1 этажа» прилипал к зданию.
 *
 * @param area где искать, единицы повёрнутого листа
 * @param options.seed «здание здесь» — точка листа, у которой здание; без неё — самое большое
 * @param options.metersPerUnit метров на местности в единице листа (`metersPerUnitOf`)
 * @returns вершины контура или `null`, если здания не нашлось
 */
export async function traceOnSheet(
  sheet: Pick<ImportSheet, 'render'>,
  rotation: number,
  area: Box,
  { seed, metersPerUnit }: { seed?: { x: number; y: number }; metersPerUnit?: number } = {}
): Promise<OutlinePoint[] | null> {
  const scale = TRACE_SIDE / Math.max(area.width, area.height);
  const canvas = await sheet.render(rotation, area, scale);
  const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
  const found = traceBuildingOutline(
    { width: canvas.width, height: canvas.height, data: pixels.data },
    {
      seed: seed && { x: (seed.x - area.x) * scale, y: (seed.y - area.y) * scale },
      gap: metersPerUnit ? Math.max(3, Math.round((GAP_METERS / metersPerUnit) * scale)) : undefined,
    }
  );
  return found && found.map((point) => ({ x: area.x + point.x / scale, y: area.y + point.y / scale }));
}
