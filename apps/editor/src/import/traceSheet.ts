import { traceBuildingOutline } from './outline';
import type { OutlinePoint } from './outline';
import { rotatedPage } from './planGeometry';
import type { ImportSheet } from './readers';
import { cleanSheet, stampBoxes } from './sheetClean';
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
 * Перед поиском лист очищается (запись 82): штампы и заголовки по надписям
 * PDF стираются всегда, рамка листа — когда ищут по всему листу.
 *
 * @param area где искать, единицы повёрнутого листа
 * @param options.seed «здание здесь» — точка листа, у которой здание; без неё — самое большое
 * @param options.metersPerUnit метров на местности в единице листа (`metersPerUnitOf`)
 * @returns вершины контура или `null`, если здания не нашлось
 */
export async function traceOnSheet(
  sheet: Pick<ImportSheet, 'render' | 'labels' | 'size'>,
  rotation: number,
  area: Box,
  { seed, metersPerUnit }: { seed?: { x: number; y: number }; metersPerUnit?: number } = {}
): Promise<OutlinePoint[] | null> {
  // Почти весь лист — значит, весь: обрезка полей, срезав край, оставляла от
  // рамки две стороны, а рамкой считаются хотя бы три (запись 82).
  const page = rotatedPage(sheet.size, rotation).size;
  const whole = area.width * area.height >= page.width * page.height * 0.9;
  const region = whole ? { x: 0, y: 0, width: page.width, height: page.height } : area;
  const scale = TRACE_SIDE / Math.max(region.width, region.height);
  const canvas = await sheet.render(rotation, region, scale);
  const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
  const at = seed && { x: (seed.x - region.x) * scale, y: (seed.y - region.y) * scale };
  const clean = cleanSheet(
    { width: canvas.width, height: canvas.height, data: pixels.data },
    {
      // Рамка листа — только когда на картинке весь лист: у рамки вокруг здания её нет.
      frame: whole,
      stamps: stampBoxes(sheet.labels, sheet.size, rotation, region, scale),
      keep: at,
    }
  );
  const found = traceBuildingOutline(
    clean,
    {
      seed: at,
      gap: metersPerUnit ? Math.max(3, Math.round((GAP_METERS / metersPerUnit) * scale)) : undefined,
    }
  );
  return found && found.map((point) => ({ x: region.x + point.x / scale, y: region.y + point.y / scale }));
}
