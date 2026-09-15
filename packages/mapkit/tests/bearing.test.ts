import { describe, expect, it } from 'vitest';
import { angleDelta, normalizeBearing, rotateAround, rotatedExtent, settledBearing, touchAngle } from '../src/bearing.js';

/** Поворот карты: геометрия без Leaflet (запись 36). */
describe('bearing', () => {
  it('угол приводится к (-180, 180]', () => {
    expect(normalizeBearing(0)).toBe(0);
    expect(normalizeBearing(190)).toBe(-170);
    expect(normalizeBearing(-190)).toBe(170);
    expect(normalizeBearing(180)).toBe(180);
    expect(normalizeBearing(-180)).toBe(180);
    expect(normalizeBearing(720 + 45)).toBe(45);
  });

  it('кратчайший поворот идёт через 180°, а не в обход', () => {
    expect(angleDelta(170, -170)).toBe(20);
    expect(angleDelta(-170, 170)).toBe(-20);
  });

  it('поворот на 90° по часовой при оси y вниз: восток уходит на юг', () => {
    const point = rotateAround({ x: 10, y: 0 }, { x: 0, y: 0 }, 90);
    expect(point.x).toBeCloseTo(0);
    expect(point.y).toBeCloseTo(10);
  });

  it('габарит повёрнутого прямоугольника — по всем углам', () => {
    const extent = rotatedExtent({ minX: -2, minY: -1, maxX: 2, maxY: 1 }, { x: 0, y: 0 }, 90);
    expect(extent.minX).toBeCloseTo(-1);
    expect(extent.maxX).toBeCloseTo(1);
    expect(extent.minY).toBeCloseTo(-2);
    expect(extent.maxY).toBeCloseTo(2);
  });

  it('угол между касаниями и прилипание к северу', () => {
    expect(touchAngle({ x: 0, y: 0 }, { x: 0, y: 5 })).toBe(90);
    expect(settledBearing(5)).toBe(0);
    expect(settledBearing(-6.9)).toBe(0);
    expect(settledBearing(8)).toBe(8);
    expect(settledBearing(365)).toBe(0);
  });
});
