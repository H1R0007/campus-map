import { describe, expect, it } from 'vitest';
import { cutOutline, outlineFromClicks } from '../src/import/outlineEdit';
import { outlineBox, traceBuildingOutline } from '../src/import/outline';
import type { OutlinePoint } from '../src/import/outline';

/** Инструменты мастерской листов (запись 81): вырез, обводка по точкам, «здание здесь». */

const square: OutlinePoint[] = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
];
const page = { width: 200, height: 200 };
const corners = (outline: readonly OutlinePoint[]) => outline.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).sort();

describe('вырезать прямоугольником', () => {
  it('угол, на который лёг прямоугольник, отрезан: квадрат стал «Г»', () => {
    const result = cutOutline(square, null, page, { x: 60, y: -10, width: 50, height: 50 });
    if ('problem' in result) throw new Error(result.problem);
    expect(corners(result.outline)).toEqual(['0,0', '0,100', '100,100', '100,40', '60,0', '60,40'].sort());
    expect(result.dropped).toBe(0);
  });

  it('прилипший кусок отрезанный целиком уходит: остаётся больший', () => {
    const strip: OutlinePoint[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 20 },
      { x: 0, y: 20 },
    ];
    const result = cutOutline(strip, null, page, { x: 30, y: -5, width: 5, height: 30 });
    if ('problem' in result) throw new Error(result.problem);
    const box = outlineBox(result.outline);
    expect(box.x).toBeCloseTo(35, 6);
    expect(box.width).toBeCloseTo(65, 6);
    expect(result.dropped).toBe(1);
  });

  it('без контура режется рамка, а без рамки — весь лист', () => {
    const fromCrop = cutOutline(null, { x: 0, y: 0, width: 100, height: 100 }, page, { x: 60, y: -10, width: 50, height: 50 });
    if ('problem' in fromCrop) throw new Error(fromCrop.problem);
    expect(fromCrop.outline).toHaveLength(6);
    const fromPage = cutOutline(null, null, page, { x: 150, y: 150, width: 60, height: 60 });
    if ('problem' in fromPage) throw new Error(fromPage.problem);
    expect(corners(fromPage.outline)).toEqual(['0,0', '0,200', '150,150', '150,200', '200,0', '200,150'].sort());
  });

  it('дуга, которой вырез не коснулся, остаётся дугой и выгнута в ту же сторону', () => {
    const arc = square.map((p, i) => (i === 2 ? { ...p, bulge: 0.5 } : p));
    const result = cutOutline(arc, null, page, { x: 60, y: -10, width: 50, height: 50 });
    if ('problem' in result) throw new Error(result.problem);
    expect(result.outline.filter((p) => p.bulge)).toHaveLength(1);
    expect(Math.abs(result.outline.find((p) => p.bulge)!.bulge!)).toBeCloseTo(0.5, 9);
    // Дуга наружу — контур ниже 100; выгнись она внутрь, низ остался бы на 100.
    expect(outlineBox(result.outline).height).toBeCloseTo(outlineBox(arc).height, 6);
  });

  it('контур, обойдённый в другую сторону, — дуга тоже не переворачивается', () => {
    // Обход против прежнего: библиотека вернёт кольцо в обратную сторону, знак изгиба меняется.
    const reversed: OutlinePoint[] = [
      { x: 0, y: 0 },
      { x: 0, y: 100 },
      { x: 100, y: 100, bulge: 0.5 },
      { x: 100, y: 0 },
    ];
    const result = cutOutline(reversed, null, page, { x: -10, y: -10, width: 50, height: 50 });
    if ('problem' in result) throw new Error(result.problem);
    expect(result.outline.filter((p) => p.bulge)).toHaveLength(1);
    const before = outlineBox(reversed);
    const after = outlineBox(result.outline);
    expect(after.x + after.width).toBeCloseTo(before.x + before.width, 6);
  });

  it('вырез внутри, мимо и на весь план объясняется словами', () => {
    expect(cutOutline(square, null, page, { x: 40, y: 40, width: 10, height: 10 })).toEqual({ problem: expect.stringMatching(/внутри плана/) });
    expect(cutOutline(square, null, page, { x: 150, y: 150, width: 10, height: 10 })).toEqual({ problem: expect.stringMatching(/не задел/) });
    expect(cutOutline(square, null, page, { x: -5, y: -5, width: 120, height: 120 })).toEqual({ problem: expect.stringMatching(/весь план/) });
  });
});

describe('обвести по точкам', () => {
  it('четыре щелчка — четыре угла', () => {
    expect(corners(outlineFromClicks([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 30 }, { x: 0, y: 30 }])!)).toEqual(['0,0', '0,30', '50,0', '50,30']);
  });

  it('меньше трёх точек или все на прямой — не контур', () => {
    expect(outlineFromClicks([{ x: 0, y: 0 }, { x: 10, y: 0 }])).toBeNull();
    expect(outlineFromClicks([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }])).toBeNull();
    expect(outlineFromClicks([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 10 }])).toBeNull();
  });

  it('перекрученный «бантик» распадается — остаётся больший треугольник', () => {
    const bowtie = outlineFromClicks([{ x: 0, y: 0 }, { x: 100, y: 60 }, { x: 100, y: 0 }, { x: 0, y: 100 }])!;
    expect(bowtie).toHaveLength(3);
    // Левый треугольник больше правого: его основание — весь левый край.
    expect(outlineBox(bowtie).x).toBeCloseTo(0, 6);
  });
});

describe('здание здесь', () => {
  // Белый лист 200 × 100 с двумя «зданиями»: большое слева, маленькое справа.
  const width = 200;
  const height = 100;
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  const fill = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) data.set([30, 30, 30, 255], (y * width + x) * 4);
  };
  fill(10, 10, 90, 90);
  fill(130, 30, 170, 70);
  const src = { width, height, data };
  const box = (outline: OutlinePoint[] | null) => {
    const b = outlineBox(outline!);
    return [b.x, b.y, b.x + b.width, b.y + b.height].map(Math.round);
  };

  it('без точки — самое большое', () => {
    expect(box(traceBuildingOutline(src))).toEqual([10, 10, 89, 89]);
  });

  it('щелчок по маленькому — его контур', () => {
    expect(box(traceBuildingOutline(src, { seed: { x: 150, y: 50 } }))).toEqual([130, 30, 169, 69]);
  });

  it('щелчок мимо — ближайшее к щелчку', () => {
    expect(box(traceBuildingOutline(src, { seed: { x: 190, y: 50 } }))).toEqual([130, 30, 169, 69]);
  });

  it('рамка листа — не здание, даже если внутри неё меньше 85 % листа', () => {
    // Лист 300 × 200: рамка в 12 px от края и здание посередине; внутри рамки — 81 % листа.
    const w = 300;
    const h = 200;
    const sheet = new Uint8ClampedArray(w * h * 4).fill(255);
    const ink = (x0: number, y0: number, x1: number, y1: number) => {
      for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) sheet.set([30, 30, 30, 255], (y * w + x) * 4);
    };
    ink(12, 12, 288, 14);
    ink(12, 186, 288, 188);
    ink(12, 12, 14, 188);
    ink(286, 12, 288, 188);
    ink(100, 60, 180, 140);
    const found = traceBuildingOutline({ width: w, height: h, data: sheet });
    expect(box(found)).toEqual([100, 60, 179, 139]);
    // По щелчку на здании — то же.
    expect(box(traceBuildingOutline({ width: w, height: h, data: sheet }, { seed: { x: 140, y: 100 } }))).toEqual([100, 60, 179, 139]);
  });
});
