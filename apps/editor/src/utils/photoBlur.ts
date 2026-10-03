import type { PhotoRegion } from '@campus-map/core';

/**
 * Размытие лиц и надписей на фото точки (запись 88).
 *
 * Рамка делится на клетки — 4 по короткой стороне, — каждая клетка берёт
 * средний цвет своих точек, и клетки растягиваются обратно с плавными
 * переходами. Получается мягкое пятно цвета, а что было в рамке, из фото не
 * восстановить: там осталось 4 × N цветов, а не лицо и не фамилия. Обычное
 * «размытие» с небольшим радиусом так не годится — его можно частично
 * обратить.
 */

/** Сколько точек остаётся по короткой стороне рамки. */
export const BLUR_CELLS = 4;

/** Наименьшая рамка — доля стороны фото: щелчок без протяжки рамкой не считается. */
export const MIN_REGION = 0.01;

export interface PixelBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Точка на фото в долях его ширины и высоты. */
export interface PhotoPoint {
  x: number;
  y: number;
}

/**
 * Рамка в пикселях холста — округлённая наружу: край лица не останется
 * резким. `null` — рамка вне холста.
 */
export function regionBox(region: PhotoRegion, width: number, height: number): PixelBox | null {
  // Запас на погрешность дробей: 0,2 + 0,1 — это 0,30000000000000004.
  const floor = (value: number) => Math.floor(value + 1e-9);
  const ceil = (value: number) => Math.ceil(value - 1e-9);
  const left = Math.max(0, floor(region.x * width));
  const top = Math.max(0, floor(region.y * height));
  const right = Math.min(width, ceil((region.x + region.width) * width));
  const bottom = Math.min(height, ceil((region.y + region.height) * height));
  return right > left && bottom > top ? { x: left, y: top, width: right - left, height: bottom - top } : null;
}

/** До какого размера сжимается рамка: по короткой стороне — `BLUR_CELLS` точек. */
export function cellsOf(box: Pick<PixelBox, 'width' | 'height'>): { width: number; height: number } {
  const scale = Math.min(1, BLUR_CELLS / Math.min(box.width, box.height));
  return { width: Math.max(1, Math.round(box.width * scale)), height: Math.max(1, Math.round(box.height * scale)) };
}

type Context2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/**
 * Средний цвет каждой клетки участка — по всем его точкам.
 *
 * Не сжатием картинки силами браузера: Chrome 130 при сильном уменьшении брал
 * отдельные точки, и буква таблички становилась сплошным красным пятном —
 * прочесть нельзя, но и на размытие не похоже, а вид зависел от браузера.
 *
 * @param pixels участок в RGBA, `width × height`
 * @returns клетки в RGBA, `cells.width × cells.height`
 */
export function averageCells(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  cells: { width: number; height: number }
): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(cells.width * cells.height * 4);
  for (let cy = 0; cy < cells.height; cy += 1) {
    const top = Math.floor((cy * height) / cells.height);
    const bottom = Math.max(top + 1, Math.floor(((cy + 1) * height) / cells.height));
    for (let cx = 0; cx < cells.width; cx += 1) {
      const left = Math.floor((cx * width) / cells.width);
      const right = Math.max(left + 1, Math.floor(((cx + 1) * width) / cells.width));
      const sum = [0, 0, 0, 0];
      for (let y = top; y < bottom; y += 1) {
        for (let x = left; x < right; x += 1) {
          const at = (y * width + x) * 4;
          for (let channel = 0; channel < 4; channel += 1) sum[channel] += pixels[at + channel];
        }
      }
      const count = (bottom - top) * (right - left);
      const target = (cy * cells.width + cx) * 4;
      for (let channel = 0; channel < 4; channel += 1) out[target + channel] = Math.round(sum[channel] / count);
    }
  }
  return out;
}

/**
 * Размывает рамки прямо на холсте — одинаково для фото и для показа в окне
 * размытия: рамка в долях, поэтому на любом размере холста пятно то же.
 *
 * @throws Error, если браузер не дал холст: молча оставить лицо нельзя
 */
export function paintBlur(context: Context2D, regions: readonly PhotoRegion[]): void {
  const { width, height } = context.canvas;
  for (const region of regions) {
    const box = regionBox(region, width, height);
    if (!box) continue;
    const cells = cellsOf(box);
    const pixels = context.getImageData(box.x, box.y, box.width, box.height).data;
    const tiny = new OffscreenCanvas(cells.width, cells.height);
    const tinyContext = tiny.getContext('2d');
    if (!tinyContext) throw new Error('Браузер не дал холст для размытия');
    tinyContext.putImageData(new ImageData(averageCells(pixels, box.width, box.height, cells), cells.width, cells.height), 0, 0);

    context.save();
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(tiny, 0, 0, cells.width, cells.height, box.x, box.y, box.width, box.height);
    context.restore();
  }
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** Рамка по двум углам — как протянули мышью, в любую сторону; не выходит за фото. */
export function regionFromCorners(a: PhotoPoint, b: PhotoPoint): PhotoRegion {
  const left = clamp01(Math.min(a.x, b.x));
  const top = clamp01(Math.min(a.y, b.y));
  return { x: left, y: top, width: clamp01(Math.max(a.x, b.x)) - left, height: clamp01(Math.max(a.y, b.y)) - top };
}

/** Рамка сдвинута, но остаётся на фото целиком. */
export function moveRegion(region: PhotoRegion, dx: number, dy: number): PhotoRegion {
  return {
    ...region,
    x: Math.min(1 - region.width, Math.max(0, region.x + dx)),
    y: Math.min(1 - region.height, Math.max(0, region.y + dy)),
  };
}

export type Corner = 'nw' | 'ne' | 'sw' | 'se';

/** Угол рамки перетащили в точку: противоположный угол стоит на месте. */
export function resizeRegion(region: PhotoRegion, corner: Corner, point: PhotoPoint): PhotoRegion {
  const fixed = {
    x: corner.endsWith('w') ? region.x + region.width : region.x,
    y: corner.startsWith('n') ? region.y + region.height : region.y,
  };
  return regionFromCorners(fixed, point);
}

/** Слишком маленькая рамка: щелчок или промах, а не обведённое лицо. */
export function isTinyRegion(region: PhotoRegion): boolean {
  return region.width < MIN_REGION || region.height < MIN_REGION;
}

/** Одинаковые ли рамки — есть ли что применять. */
export function sameRegions(a: readonly PhotoRegion[], b: readonly PhotoRegion[]): boolean {
  return (
    a.length === b.length &&
    a.every((region, i) => region.x === b[i].x && region.y === b[i].y && region.width === b[i].width && region.height === b[i].height)
  );
}
