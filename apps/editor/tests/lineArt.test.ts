import { describe, expect, it } from 'vitest';
import { REFERENCE_TINT, colorEdges, darkLines, dilate, outerContour, pageColor } from '../src/overlay/lineArt';
import type { Pixels } from '../src/overlay/lineArt';

/**
 * Линии из картинки плана (запись 62): на искусственных «планах» — лист,
 * стены, заливки комнат, заголовок, щель двери.
 */

type Rgb = [number, number, number];

function image(width: number, height: number, color: Rgb): Pixels {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let p = 0; p < width * height; p += 1) {
    data.set([...color, 255], p * 4);
  }
  return { width, height, data };
}

function fill(img: Pixels, x0: number, y0: number, x1: number, y1: number, color: Rgb, alpha = 255): void {
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) img.data.set([...color, alpha], (y * img.width + x) * 4);
  }
}

const alphaAt = (img: Pixels, x: number, y: number) => img.data[(y * img.width + x) * 4 + 3];

const WHITE: Rgb = [255, 255, 255];
const WALL: Rgb = [61, 67, 80];
const ROOM: Rgb = [232, 236, 240];

describe('стены цветом', () => {
  it('тёмная стена — цветом, лист и заливка комнаты — прозрачные', () => {
    const plan = image(60, 40, WHITE);
    fill(plan, 30, 10, 50, 30, ROOM);
    fill(plan, 10, 0, 12, 40, WALL);
    const lines = darkLines(plan, REFERENCE_TINT);

    expect(alphaAt(lines, 10, 20)).toBe(255);
    expect([...lines.data.slice((20 * 60 + 10) * 4, (20 * 60 + 10) * 4 + 3)]).toEqual([...REFERENCE_TINT]);
    expect(alphaAt(lines, 5, 20)).toBe(0);
    expect(alphaAt(lines, 40, 20)).toBe(0);
  });

  it('бледную линию скана берёт только высокая чувствительность', () => {
    const plan = image(20, 10, WHITE);
    fill(plan, 5, 0, 7, 10, [154, 160, 168]);
    expect(alphaAt(darkLines(plan, REFERENCE_TINT, 0.5), 5, 5)).toBe(0);
    expect(alphaAt(darkLines(plan, REFERENCE_TINT, 1), 5, 5)).toBeGreaterThan(0);
  });

  it('прозрачный пиксель картинки не становится линией', () => {
    const plan = image(10, 10, WALL);
    fill(plan, 0, 0, 5, 10, WALL, 0);
    const lines = darkLines(plan, REFERENCE_TINT);
    expect(alphaAt(lines, 2, 5)).toBe(0);
    expect(alphaAt(lines, 7, 5)).toBe(255);
  });
});

describe('границы заливок — для генплана', () => {
  it('граница пятна здания — линия, середина пятна и земля — пусто', () => {
    const plan = image(80, 60, [226, 236, 217]);
    fill(plan, 20, 15, 60, 45, [120, 116, 108]);
    const edges = colorEdges(plan, REFERENCE_TINT);

    expect(alphaAt(edges, 20, 30)).toBeGreaterThan(200);
    expect(alphaAt(edges, 40, 30)).toBe(0);
    expect(alphaAt(edges, 5, 5)).toBe(0);
  });
});

describe('внешний контур здания', () => {
  // Лист 120×80: здание 20..100 × 20..60 со стенами в 3 пикселя, внутренняя
  // стена, щель двери внизу, заголовок в углу.
  const building = () => {
    const plan = image(120, 80, WHITE);
    fill(plan, 20, 20, 100, 60, ROOM);
    fill(plan, 20, 20, 100, 23, WALL);
    fill(plan, 20, 57, 100, 60, WALL);
    fill(plan, 20, 20, 23, 60, WALL);
    fill(plan, 97, 20, 100, 60, WALL);
    fill(plan, 59, 23, 61, 57, WALL);
    fill(plan, 40, 57, 45, 60, ROOM); // дверь — щель в наружной стене
    fill(plan, 4, 4, 16, 8, WALL); // заголовок
    return plan;
  };

  it('обводит здание снаружи, не трогая внутренние стены и заголовок', () => {
    const contour = outerContour(building(), REFERENCE_TINT, 6);

    expect(alphaAt(contour, 20, 40)).toBe(255);
    expect(alphaAt(contour, 99, 40)).toBe(255);
    expect(alphaAt(contour, 60, 20)).toBe(255);
    expect(alphaAt(contour, 60, 40)).toBe(0);
    expect(alphaAt(contour, 40, 40)).toBe(0);
    expect(alphaAt(contour, 10, 6)).toBe(0);
  });

  it('щель двери закрыта: контур идёт по наружной стене, а не заходит внутрь', () => {
    const contour = outerContour(building(), REFERENCE_TINT, 6);
    expect(alphaAt(contour, 42, 59)).toBe(255);
    expect(alphaAt(contour, 42, 50)).toBe(0);
  });
});

describe('помощники', () => {
  it('цвет листа — по краю картинки', () => {
    const plan = image(30, 20, WHITE);
    fill(plan, 10, 5, 20, 15, WALL);
    const [r, g, b] = pageColor(plan);
    expect(Math.min(r, g, b)).toBeGreaterThan(240);
  });

  it('расширение маски — квадрат нужного радиуса', () => {
    const mask = new Uint8Array(7 * 7);
    mask[3 * 7 + 3] = 1;
    const grown = dilate(mask, 7, 7, 2);
    expect(grown.reduce((sum, v) => sum + v, 0)).toBe(25);
    expect(grown[1 * 7 + 1]).toBe(1);
    expect(grown[0]).toBe(0);
  });
});
