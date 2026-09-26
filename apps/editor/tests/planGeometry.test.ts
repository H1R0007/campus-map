import { describe, expect, it } from 'vitest';
import type { PlanSource } from '@campus-map/core';
import {
  IDENTITY,
  applySimilarity,
  composeSimilarity,
  fitSimilarity,
  invertSimilarity,
  pageToPlan,
  planChange,
  rotatedPage,
  rotationOf,
  scaleOf,
} from '../src/import/planGeometry';
import type { Point, Similarity } from '../src/import/planGeometry';

/**
 * Геометрия плана (запись 46): переделка плана из того же исходника должна
 * переносить точки разметки ровно, а совмещение по парам — находить сдвиг,
 * поворот и масштаб и показывать расхождение.
 */

const close = (actual: Point, expected: Point) => {
  expect(actual.x).toBeCloseTo(expected.x, 6);
  expect(actual.y).toBeCloseTo(expected.y, 6);
};

/** Лист A4 в пунктах, альбомный. */
const A4: PlanSource = { file: '0123456789abcdef.pdf', page: 1, pageSize: { width: 842, height: 595 } };

describe('подобие', () => {
  const t: Similarity = { a: 2 * Math.cos(0.3), b: 2 * Math.sin(0.3), tx: 5, ty: -7 };

  it('обратное возвращает точку на место', () => {
    close(applySimilarity(invertSimilarity(t), applySimilarity(t, { x: 13, y: 21 })), { x: 13, y: 21 });
  });

  it('композиция — сначала первое, потом второе', () => {
    const second: Similarity = { a: 0, b: 1, tx: 1, ty: 2 };
    const p = { x: 3, y: 4 };
    close(applySimilarity(composeSimilarity(second, t), p), applySimilarity(second, applySimilarity(t, p)));
  });

  it('масштаб и поворот читаются обратно', () => {
    expect(scaleOf(t)).toBeCloseTo(2, 9);
    expect(rotationOf(t)).toBeCloseTo((0.3 * 180) / Math.PI, 9);
    expect(rotationOf(IDENTITY)).toBe(0);
  });
});

describe('страница → план', () => {
  it('поворот на 90° меняет стороны описанного прямоугольника местами', () => {
    expect(rotatedPage(A4.pageSize, 90).size).toEqual({ width: 595, height: 842 });
    expect(rotatedPage(A4.pageSize, 180).size).toEqual({ width: 842, height: 595 });
  });

  it('без обрезки и поворота — только масштаб до размера плана', () => {
    const t = pageToPlan(A4, { width: 1684, height: 1190 });
    close(applySimilarity(t, { x: 842, y: 595 }), { x: 1684, y: 1190 });
    close(applySimilarity(t, { x: 0, y: 0 }), { x: 0, y: 0 });
  });

  it('обрезка: левый верхний угол области становится началом плана', () => {
    const source = { ...A4, crop: { x: 100, y: 50, width: 400, height: 300 } };
    const t = pageToPlan(source, { width: 2000, height: 1500 });
    close(applySimilarity(t, { x: 100, y: 50 }), { x: 0, y: 0 });
    close(applySimilarity(t, { x: 500, y: 350 }), { x: 2000, y: 1500 });
  });

  it('поворот на 90°: левый нижний угол страницы уходит в левый верхний угол плана', () => {
    const t = pageToPlan({ ...A4, rotation: 90 }, { width: 595, height: 842 });
    close(applySimilarity(t, { x: 0, y: 595 }), { x: 0, y: 0 });
    close(applySimilarity(t, { x: 842, y: 0 }), { x: 595, y: 842 });
  });
});

describe('переделка плана из того же исходника', () => {
  it('точка разметки остаётся на том же месте страницы', () => {
    const before = { source: { ...A4, crop: { x: 100, y: 50, width: 400, height: 300 } }, mapSize: { width: 2000, height: 1500 } };
    const after = { source: { ...A4, rotation: 90, crop: { x: 20, y: 80, width: 500, height: 700 } }, mapSize: { width: 1000, height: 1400 } };
    const change = planChange(before, after)!;

    // Точка страницы (300, 200) — на старом и новом плане в разных пикселях, но
    // пересчёт переводит один в другой.
    const page = { x: 300, y: 200 };
    const oldPixel = applySimilarity(pageToPlan(before.source, before.mapSize), page);
    const newPixel = applySimilarity(pageToPlan(after.source, after.mapSize), page);
    close(applySimilarity(change, oldPixel), newPixel);
  });

  it('другой файл или другая страница — точного пересчёта нет', () => {
    const plan = { source: A4, mapSize: { width: 842, height: 595 } };
    expect(planChange(plan, { ...plan, source: { ...A4, file: 'fedcba9876543210.pdf' } })).toBeNull();
    expect(planChange(plan, { ...plan, source: { ...A4, page: 2 } })).toBeNull();
  });
});

describe('совмещение по парам точек', () => {
  const truth: Similarity = { a: 0.5 * Math.cos(-0.4), b: 0.5 * Math.sin(-0.4), tx: 120, ty: 40 };
  const pairsFor = (points: Point[]) => points.map((from) => ({ from, to: applySimilarity(truth, from) }));

  it('двух пар хватает, чтобы найти сдвиг, поворот и масштаб точно', () => {
    const fit = fitSimilarity(pairsFor([{ x: 0, y: 0 }, { x: 100, y: 30 }]))!;
    expect(fit.transform.a).toBeCloseTo(truth.a, 9);
    expect(fit.transform.b).toBeCloseTo(truth.b, 9);
    close({ x: fit.transform.tx, y: fit.transform.ty }, { x: truth.tx, y: truth.ty });
    expect(fit.rms).toBeCloseTo(0, 9);
  });

  it('промах в одной паре виден по её расхождению', () => {
    const pairs = pairsFor([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }, { x: 100, y: 100 }]);
    pairs[3] = { ...pairs[3], to: { x: pairs[3].to.x + 10, y: pairs[3].to.y } };
    const fit = fitSimilarity(pairs)!;

    const worst = fit.residuals.indexOf(Math.max(...fit.residuals));
    expect(worst).toBe(3);
    expect(fit.rms).toBeGreaterThan(1);
  });

  it('меньше двух пар или одна и та же точка — совместить нельзя', () => {
    expect(fitSimilarity(pairsFor([{ x: 1, y: 1 }]))).toBeNull();
    expect(fitSimilarity(pairsFor([{ x: 1, y: 1 }, { x: 1, y: 1 }]))).toBeNull();
  });
});
