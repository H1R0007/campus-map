import { describe, expect, it } from 'vitest';
import {
  bulgeThrough,
  edgeHandle,
  flattenOutline,
  outlineBox,
  outlineOfBox,
  removeOutlinePoint,
  rotateOutline,
  splitOutlineEdge,
  traceBuildingOutline,
} from '../src/import/outline';
import type { OutlinePoint } from '../src/import/outline';
import { rotatePiece } from '../src/import/importModel';

/**
 * Контур здания на листе (запись 73): многоугольник с дугами вместо
 * прямоугольной обрезки.
 */

const close = (a: number, b: number, tolerance = 0.5) => Math.abs(a - b) <= tolerance;

describe('дуги контура', () => {
  it('изгиб 1 — полуокружность: точки на окружности над хордой', () => {
    // Ребро слева направо, изгиб влево по ходу — вверх на экране.
    const points = flattenOutline([{ x: 0, y: 100, bulge: 1 }, { x: 200, y: 100 }]);
    const arc = points.filter((p) => p.y < 100);
    expect(arc.length).toBeGreaterThan(10);
    for (const p of arc) expect(close(Math.hypot(p.x - 100, p.y - 100), 100, 0.01)).toBe(true);
    expect(Math.min(...points.map((p) => p.y))).toBeCloseTo(0, 0);
  });

  it('круг из двух вершин — описанный квадрат', () => {
    const box = outlineBox([{ x: 0, y: 50, bulge: 1 }, { x: 100, y: 50, bulge: 1 }]);
    expect(box.x).toBeCloseTo(0, 1);
    expect(box.y).toBeCloseTo(0, 1);
    expect(box.width).toBeCloseTo(100, 1);
    expect(box.height).toBeCloseTo(100, 1);
  });

  it('ручка ребра — середина дуги; протянули за ручку — тот же изгиб', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 100, y: 0 };
    const handle = edgeHandle(a, b, 0.4);
    expect(handle).toEqual({ x: 50, y: -20 });
    expect(bulgeThrough(a, b, handle)).toBeCloseTo(0.4, 6);
    expect(bulgeThrough(a, b, { x: 50, y: 0 })).toBe(0);
  });

  it('новая вершина на дуге сохраняет её форму', () => {
    const outline: OutlinePoint[] = [{ x: 0, y: 100, bulge: 1 }, { x: 200, y: 100 }, { x: 200, y: 200 }, { x: 0, y: 200 }];
    const split = splitOutlineEdge(outline, 0);
    expect(split).toHaveLength(5);
    expect(split[1].x).toBeCloseTo(100, 6);
    expect(split[1].y).toBeCloseTo(0, 6);
    expect(outlineBox(split).y).toBeCloseTo(outlineBox(outline).y, 1);
    for (const p of flattenOutline(split).filter((p) => p.y < 100)) {
      expect(close(Math.hypot(p.x - 100, p.y - 100), 100, 0.05)).toBe(true);
    }
  });

  it('вершину не убрать, если контур перестанет быть контуром', () => {
    const triangle: OutlinePoint[] = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }];
    expect(removeOutlinePoint(triangle, 1)).toEqual(triangle);
    const square = outlineOfBox({ x: 0, y: 0, width: 10, height: 10 });
    expect(removeOutlinePoint(square, 0)).toHaveLength(3);
  });
});

describe('поворот листа поворачивает и контур', () => {
  it('контур и обрезка после поворота совпадают', () => {
    const size = { width: 400, height: 300 };
    const outline: OutlinePoint[] = [{ x: 50, y: 40, bulge: 0.3 }, { x: 250, y: 40 }, { x: 250, y: 200 }, { x: 50, y: 200 }];
    const box = outlineBox(outline);
    const turned = rotatePiece({ id: 'p', sheetId: 's', rotation: 0, crop: box, trimmed: false, target: { kind: 'skip' }, notes: [], outline }, size, 1);
    expect(turned.outline).toEqual(rotateOutline(outline, size, 1));
    const after = outlineBox(turned.outline!);
    expect(after.x).toBeCloseTo(turned.crop!.x, 6);
    expect(after.y).toBeCloseTo(turned.crop!.y, 6);
    expect(after.width).toBeCloseTo(turned.crop!.width, 6);
    expect(turned.outline![0].bulge).toBe(0.3);
  });
});

describe('контур здания по картинке', () => {
  /** Лист: белый, Г-образное здание со стенами, внутри комнаты; по желанию — рамка и штамп. */
  function sheet({ frame = false } = {}) {
    const width = 300;
    const height = 220;
    const data = new Uint8ClampedArray(width * height * 4).fill(255);
    const ink = (x: number, y: number) => data.set([30, 30, 30, 255], (y * width + x) * 4);
    const rect = (x0: number, y0: number, x1: number, y1: number) => {
      for (let x = x0; x <= x1; x += 1) {
        ink(x, y0);
        ink(x, y1);
      }
      for (let y = y0; y <= y1; y += 1) {
        ink(x0, y);
        ink(x1, y);
      }
    };
    // Г: длинное крыло сверху и крыло вниз слева.
    for (let x = 40; x <= 240; x += 1) ink(x, 30);
    for (let y = 30; y <= 190; y += 1) ink(40, y);
    for (let x = 40; x <= 110; x += 1) ink(x, 190);
    for (let y = 90; y <= 190; y += 1) ink(110, y);
    for (let x = 110; x <= 240; x += 1) ink(x, 90);
    for (let y = 30; y <= 90; y += 1) ink(240, y);
    rect(60, 40, 100, 80); // комната
    if (frame) {
      rect(4, 4, width - 5, height - 5);
      rect(200, 160, 280, 200); // штамп
    }
    return { width, height, data };
  }

  const cornerNear = (outline: OutlinePoint[], x: number, y: number) => outline.some((p) => Math.hypot(p.x - x, p.y - y) < 6);

  it('Г-образное здание — шесть углов', () => {
    const outline = traceBuildingOutline(sheet())!;
    expect(outline).not.toBeNull();
    expect(outline.length).toBeGreaterThanOrEqual(6);
    expect(outline.length).toBeLessThanOrEqual(10);
    for (const [x, y] of [[40, 30], [240, 30], [240, 90], [110, 90], [110, 190], [40, 190]]) {
      expect(cornerNear(outline, x, y), `нет угла ${x},${y}`).toBe(true);
    }
  });

  it('рамка листа и штамп не мешают: контур — здание, а не лист', () => {
    const outline = traceBuildingOutline(sheet({ frame: true }))!;
    const box = outlineBox(outline);
    expect(box.width).toBeLessThan(220);
    expect(cornerNear(outline, 110, 190)).toBe(true);
    expect(cornerNear(outline, 280, 200)).toBe(false);
  });

  it('пустой лист — контура нет', () => {
    const data = new Uint8ClampedArray(50 * 40 * 4).fill(255);
    expect(traceBuildingOutline({ width: 50, height: 40, data })).toBeNull();
  });
});
