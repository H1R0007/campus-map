import { describe, expect, it } from 'vitest';
import {
  BLUR_CELLS,
  averageCells,
  cellsOf,
  isTinyRegion,
  moveRegion,
  regionBox,
  regionFromCorners,
  resizeRegion,
  sameRegions,
} from '../src/utils/photoBlur';

/**
 * Рамки размытия (запись 88): в долях фото, поэтому одни и те же на исходном
 * снимке, полном фото и в окне; в пикселях — округлены наружу.
 */

describe('рамка в пикселях', () => {
  it('округляется наружу: край лица не остаётся резким', () => {
    expect(regionBox({ x: 0.1003, y: 0.2, width: 0.1, height: 0.1 }, 1000, 500)).toEqual({ x: 100, y: 100, width: 101, height: 50 });
  });

  it('не выходит за холст; рамка вне холста — нет рамки', () => {
    expect(regionBox({ x: 0.95, y: 0.95, width: 0.1, height: 0.1 }, 100, 100)).toEqual({ x: 95, y: 95, width: 5, height: 5 });
    expect(regionBox({ x: 1, y: 0, width: 0.1, height: 0.1 }, 100, 100)).toBeNull();
  });

  it(`сжимается до ${BLUR_CELLS} точек по короткой стороне, длинная — в той же пропорции`, () => {
    expect(cellsOf({ width: 200, height: 100 })).toEqual({ width: 2 * BLUR_CELLS, height: BLUR_CELLS });
    expect(cellsOf({ width: 30, height: 900 })).toEqual({ width: BLUR_CELLS, height: 30 * BLUR_CELLS });
    // Рамка мельче клеток не растёт.
    expect(cellsOf({ width: 2, height: 3 })).toEqual({ width: 2, height: 3 });
  });
});

describe('средний цвет клеток', () => {
  /** Участок RGBA из функции цвета точки. */
  const area = (width: number, height: number, color: (x: number, y: number) => [number, number, number]) => {
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) pixels.set([...color(x, y), 255], (y * width + x) * 4);
    }
    return pixels;
  };

  it('клетка — среднее всех своих точек, а не одна из них: мелкая шашка становится серой', () => {
    const board = area(8, 4, (x, y) => ((x + y) % 2 === 0 ? [0, 0, 0] : [255, 255, 255]));
    expect([...averageCells(board, 8, 4, { width: 2, height: 1 })]).toEqual([128, 128, 128, 255, 128, 128, 128, 255]);
  });

  it('красные буквы на белом дают светлое розовое пятно, а не красное', () => {
    // Четверть точек — буквы, как у таблички «ТЕСТ».
    const sign = area(8, 8, (x, y) => (x % 2 === 0 && y % 2 === 0 ? [180, 35, 24] : [255, 255, 255]));
    const [r, g, b] = averageCells(sign, 8, 8, { width: 1, height: 1 });
    expect([r, g, b]).toEqual([236, 200, 197]);
  });

  it('стороны не делятся нацело — каждая точка попадает ровно в одну клетку', () => {
    const stripes = area(5, 1, (x) => (x < 2 ? [100, 0, 0] : [0, 0, 90]));
    expect([...averageCells(stripes, 5, 1, { width: 2, height: 1 })]).toEqual([100, 0, 0, 255, 0, 0, 90, 255]);
  });
});

describe('рамка мышью', () => {
  it('тянут в любую сторону — рамка та же', () => {
    const down = regionFromCorners({ x: 0.2, y: 0.3 }, { x: 0.5, y: 0.7 });
    const up = regionFromCorners({ x: 0.5, y: 0.7 }, { x: 0.2, y: 0.3 });
    expect(up).toEqual(down);
    expect(down.x).toBeCloseTo(0.2);
    expect(down.width).toBeCloseTo(0.3);
    expect(down.height).toBeCloseTo(0.4);
  });

  it('за краем фото — обрезается по краю', () => {
    expect(regionFromCorners({ x: 0.8, y: -0.2 }, { x: 1.4, y: 0.1 })).toEqual({ x: 0.8, y: 0, width: 0.19999999999999996, height: 0.1 });
  });

  it('сдвиг не уводит рамку за фото', () => {
    const region = { x: 0.7, y: 0.1, width: 0.2, height: 0.2 };
    expect(moveRegion(region, 0.5, -0.5)).toEqual({ x: 0.8, y: 0, width: 0.2, height: 0.2 });
    expect(moveRegion(region, -0.1, 0.1).x).toBeCloseTo(0.6);
  });

  it('угол тянут — противоположный стоит; через него — рамка выворачивается, а не пропадает', () => {
    const region = { x: 0.2, y: 0.2, width: 0.4, height: 0.4 };
    const se = resizeRegion(region, 'se', { x: 0.9, y: 0.7 });
    expect([se.x, se.y, se.width, se.height].map((value) => Number(value.toFixed(6)))).toEqual([0.2, 0.2, 0.7, 0.5]);

    const nw = resizeRegion(region, 'nw', { x: 0.7, y: 0.1 });
    expect([nw.x, nw.y, nw.width, nw.height].map((value) => Number(value.toFixed(6)))).toEqual([0.6, 0.1, 0.1, 0.5]);
  });

  it('щелчок без протяжки — не рамка', () => {
    expect(isTinyRegion(regionFromCorners({ x: 0.5, y: 0.5 }, { x: 0.503, y: 0.6 }))).toBe(true);
    expect(isTinyRegion(regionFromCorners({ x: 0.5, y: 0.5 }, { x: 0.52, y: 0.52 }))).toBe(false);
  });

  it('одинаковые рамки — применять нечего', () => {
    const a = [{ x: 0.1, y: 0.1, width: 0.2, height: 0.2 }];
    expect(sameRegions(a, [{ ...a[0] }])).toBe(true);
    expect(sameRegions(a, [])).toBe(false);
    expect(sameRegions(a, [{ ...a[0], x: 0.11 }])).toBe(false);
  });
});
