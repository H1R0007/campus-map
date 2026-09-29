import { describe, expect, it } from 'vitest';
import { silhouette } from '../src/overlay/lineArt';
import type { Pixels } from '../src/overlay/lineArt';
import { matchSilhouettes } from '../src/overlay/silhouetteMatch';
import type { PlanSilhouette } from '../src/overlay/silhouetteMatch';
import { IDENTITY } from '../src/import/planGeometry';

/**
 * Силуэт здания на плане и сравнение этажей (запись 67): тот же способ, что у
 * контура при наложении, — на искусственных планах.
 */

type Rgb = [number, number, number];
const WHITE: Rgb = [255, 255, 255];
const WALL: Rgb = [61, 67, 80];

function image(width: number, height: number): Pixels {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let p = 0; p < width * height; p += 1) data.set([...WHITE, 255], p * 4);
  return { width, height, data };
}

function fill(img: Pixels, x0: number, y0: number, x1: number, y1: number, color: Rgb): void {
  for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) img.data.set([...color, 255], (y * img.width + x) * 4);
}

/** Здание — рамка стен со щелью двери; сверху — строка заголовка листа. */
function plan(): Pixels {
  const img = image(120, 90);
  fill(img, 20, 20, 100, 22, WALL);
  fill(img, 20, 78, 55, 80, WALL);
  fill(img, 61, 78, 100, 80, WALL);
  fill(img, 20, 20, 22, 80, WALL);
  fill(img, 98, 20, 100, 80, WALL);
  fill(img, 30, 4, 70, 8, WALL);
  return img;
}

const at = (mask: Uint8Array, width: number, x: number, y: number) => mask[y * width + x];

/** Прямоугольник-силуэт в маске заданного размера. */
function box(width: number, height: number, x0: number, y0: number, x1: number, y1: number, scale = 1): PlanSilhouette {
  const mask = new Uint8Array(width * height);
  for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) mask[y * width + x] = 1;
  return { width, height, mask, scale };
}

describe('силуэт здания', () => {
  it('внутри стен — здание, щель двери закрыта, заголовок листа отпал', () => {
    const img = plan();
    const mask = silhouette(img, 5);
    expect(at(mask, img.width, 60, 50)).toBe(1);
    expect(at(mask, img.width, 58, 79)).toBe(1);
    expect(at(mask, img.width, 50, 6)).toBe(0);
    expect(at(mask, img.width, 5, 50)).toBe(0);
  });

  it('пустой лист — силуэта нет', () => {
    const img = image(40, 30);
    expect(silhouette(img, 3).every((value) => value === 0)).toBe(true);
  });
});

describe('сравнение этажей', () => {
  it('одинаковые силуэты совпадают целиком', () => {
    const a = box(100, 80, 10, 10, 90, 70);
    expect(matchSilhouettes(a, a, IDENTITY)).toEqual({ overlap: 1, areaRatio: 1 });
  });

  it('этаж, сдвинутый на полздания, совпадает наполовину', () => {
    const base = box(100, 80, 10, 10, 90, 70);
    const floor = box(100, 80, 10, 10, 90, 70);
    const match = matchSilhouettes(base, floor, { a: 1, b: 0, tx: 40, ty: 0 })!;
    expect(match.overlap).toBeCloseTo(0.5, 2);
    expect(match.areaRatio).toBeCloseTo(1, 5);
  });

  it('верхний этаж меньше, но стоит на нижнем — совпадает', () => {
    const base = box(100, 80, 10, 10, 90, 70);
    const floor = box(100, 80, 30, 20, 60, 50);
    const match = matchSilhouettes(base, floor, IDENTITY)!;
    expect(match.overlap).toBe(1);
    expect(match.areaRatio).toBeCloseTo((30 * 30) / (80 * 60), 5);
  });

  it('разный размер картинок и привязка с масштабом считаются в пикселях плана', () => {
    // План этажа вдвое крупнее, а маска его уменьшена вдвое: привязка ×0,5 ставит его на место.
    const base = box(100, 80, 10, 10, 90, 70);
    const floor = box(100, 80, 10, 10, 90, 70, 2);
    const match = matchSilhouettes(base, floor, { a: 0.5, b: 0, tx: 0, ty: 0 })!;
    expect(match.overlap).toBeCloseTo(1, 5);
    expect(match.areaRatio).toBeCloseTo(1, 5);
  });

  it('площадь этажа пересчитывается масштабом привязки', () => {
    // План этажа вдвое крупнее в пикселях, привязка ×0,5: это то же здание.
    const base = box(100, 80, 10, 10, 50, 50);
    const floor = box(200, 160, 20, 20, 100, 100);
    const match = matchSilhouettes(base, floor, { a: 0.5, b: 0, tx: 0, ty: 0 })!;
    expect(match.overlap).toBeCloseTo(1, 5);
    expect(match.areaRatio).toBeCloseTo(1, 5);
  });

  it('без силуэта сравнивать нечего', () => {
    const base = box(10, 10, 0, 0, 0, 0);
    expect(matchSilhouettes(base, box(10, 10, 2, 2, 8, 8), IDENTITY)).toBeNull();
  });
});
