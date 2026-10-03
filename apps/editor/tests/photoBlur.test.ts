import { describe, expect, it } from 'vitest';
import {
  BLUR_CELLS,
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
