import { describe, expect, it } from 'vitest';
import { WHEEL_PIXELS_PER_LEVEL, ZOOM_TIME_CONSTANT_MS, approachZoom, wheelZoomDelta } from '../src/zoomMotion.js';

/**
 * Покадровый масштаб плавной камеры: от него зависит, дёргается ли карта.
 */
describe('approachZoom', () => {
  it('за постоянную времени проходит ~63 % пути, в любую сторону', () => {
    expect(approachZoom(0, 1, ZOOM_TIME_CONSTANT_MS)).toBeCloseTo(1 - Math.exp(-1), 9);
    expect(approachZoom(3, 2, ZOOM_TIME_CONSTANT_MS)).toBeCloseTo(2 + Math.exp(-1), 9);
  });

  it('путь не зависит от частоты кадров', () => {
    let fast = 0;
    for (let frame = 0; frame < 20; frame += 1) fast = approachZoom(fast, 2, 8);
    let slow = 0;
    for (let frame = 0; frame < 5; frame += 1) slow = approachZoom(slow, 2, 32);
    expect(fast).toBeCloseTo(slow, 9);
  });

  it('у самой цели встаёт точно на неё — движение заканчивается', () => {
    expect(approachZoom(1.999, 2, 16)).toBe(2);
    expect(approachZoom(1, 2, 10_000)).toBe(2);
  });

  it('время назад не отматывает', () => {
    expect(approachZoom(1, 2, -50)).toBe(1);
  });
});

describe('wheelZoomDelta', () => {
  it('прокрутка вверх приближает, вниз — отдаляет', () => {
    expect(wheelZoomDelta({ deltaY: -WHEEL_PIXELS_PER_LEVEL, deltaMode: 0, ctrlKey: false })).toBeCloseTo(1, 9);
    expect(wheelZoomDelta({ deltaY: WHEEL_PIXELS_PER_LEVEL / 2, deltaMode: 0, ctrlKey: false })).toBeCloseTo(-0.5, 9);
  });

  it('строки и страницы переводятся в пиксели, шаг одного события ограничен', () => {
    expect(wheelZoomDelta({ deltaY: -3, deltaMode: 1, ctrlKey: false })).toBeCloseTo(60 / WHEEL_PIXELS_PER_LEVEL, 9);
    expect(wheelZoomDelta({ deltaY: -1, deltaMode: 2, ctrlKey: false })).toBe(1.5);
    expect(wheelZoomDelta({ deltaY: 10_000, deltaMode: 0, ctrlKey: false })).toBe(-1.5);
  });

  it('щипок тачпада (колесо с Ctrl) масштабирует сильнее мелкой прокрутки', () => {
    const pinch = wheelZoomDelta({ deltaY: -5, deltaMode: 0, ctrlKey: true });
    const scroll = wheelZoomDelta({ deltaY: -5, deltaMode: 0, ctrlKey: false });
    expect(pinch).toBeCloseTo(scroll * 4, 9);
  });
});
