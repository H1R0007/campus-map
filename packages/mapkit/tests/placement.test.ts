import { describe, expect, it } from 'vitest';
import { createCampusProjection } from '@campus-map/core';
import type { BuildingMeta } from '@campus-map/core';
import {
  containsPoint,
  distanceToPolygon,
  extentOf,
  planCorners,
  planPointToWorld,
  planTransform,
} from '../src/placement.js';
import type { PlanPlacement } from '../src/placement.js';

/**
 * Геометрия плана на холсте кампуса.
 *
 * Узлы на территорию переводит ядро, картинку плана — mapkit. Если формулы
 * разойдутся, маршрут сползёт с коридоров, поэтому главная проверка — совпадение
 * с проекцией ядра при любом повороте.
 */

const PLACEMENT: PlanPlacement = { metersPerPixel: 0.1, originMeters: { x: 30, y: 40 }, rotationDeg: 0 };

const close = (actual: { x: number; y: number }, expected: { x: number; y: number }) => {
  expect(actual.x).toBeCloseTo(expected.x, 9);
  expect(actual.y).toBeCloseTo(expected.y, 9);
};

describe('planPointToWorld и planCorners', () => {
  it('без поворота — сдвиг и масштаб', () => {
    const corners = planCorners(PLACEMENT, { width: 720, height: 260 });
    [
      { x: 30, y: 40 },
      { x: 102, y: 40 },
      { x: 102, y: 66 },
      { x: 30, y: 66 },
    ].forEach((expected, index) => close(corners[index], expected));
  });

  it('поворот по часовой стрелке при оси y вниз: правый верхний угол на 90° уходит вниз', () => {
    const turned = { ...PLACEMENT, rotationDeg: 90 };
    close(planPointToWorld(turned, 100, 0), { x: 30, y: 50 });
    close(planPointToWorld(turned, 0, 100), { x: 20, y: 40 });
  });

  it('совпадает с проекцией ядра при любом повороте', () => {
    for (const rotationDeg of [0, 20, 90, 137, -45]) {
      const placement: PlanPlacement = { ...PLACEMENT, rotationDeg };
      const building: BuildingMeta = {
        id: 'b',
        name: 'Корпус',
        placement: { ...placement, baseElevationMeters: 0, floorHeightMeters: 3.6 },
        floors: [{ floor: 1 }],
      };
      const projection = createCampusProjection(
        { buildings: [{ id: 'b' }], mapSize: { width: 1, height: 1 }, metersPerPixel: 0.5 },
        [building]
      );

      for (const [x, y] of [[0, 0], [720, 0], [355, 131], [12, 260]]) {
        const world = projection.toWorld({ building: 'b', floor: 1, x, y });
        expect(world).not.toBeNull();
        close(planPointToWorld(placement, x, y), world!);
      }
    }
  });

  it('габариты повёрнутого плана охватывают все углы', () => {
    const corners = planCorners({ ...PLACEMENT, rotationDeg: 20 }, { width: 600, height: 300 });
    const extent = extentOf(corners);
    for (const corner of corners) {
      expect(corner.x).toBeGreaterThanOrEqual(extent.minX);
      expect(corner.x).toBeLessThanOrEqual(extent.maxX);
      expect(corner.y).toBeGreaterThanOrEqual(extent.minY);
      expect(corner.y).toBeLessThanOrEqual(extent.maxY);
    }
    expect(extent.maxX - extent.minX).toBeCloseTo(60 * Math.cos(Math.PI / 9) + 30 * Math.sin(Math.PI / 9), 9);
  });
});

describe('planTransform', () => {
  it('перенос, поворот, масштаб пикселя плана в экранные пиксели', () => {
    expect(planTransform({ x: 10, y: -4 }, 8, { ...PLACEMENT, rotationDeg: 20 })).toBe(
      'translate3d(10px, -4px, 0) rotate(20deg) scale(0.8)'
    );
  });

  it('у повёрнутой карты план поворачивается и на угол карты', () => {
    expect(planTransform({ x: 10, y: -4 }, 8, { ...PLACEMENT, rotationDeg: 20 }, -35)).toBe(
      'translate3d(10px, -4px, 0) rotate(-15deg) scale(0.8)'
    );
  });
});

describe('containsPoint и distanceToPolygon', () => {
  const square = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ];

  it('внутри — ноль, снаружи — расстояние до ближайшей стороны или угла', () => {
    expect(containsPoint(square, { x: 5, y: 5 })).toBe(true);
    expect(distanceToPolygon(square, { x: 5, y: 5 })).toBe(0);
    expect(containsPoint(square, { x: 15, y: 5 })).toBe(false);
    expect(distanceToPolygon(square, { x: 15, y: 5 })).toBeCloseTo(5, 9);
    expect(distanceToPolygon(square, { x: 13, y: 14 })).toBeCloseTo(5, 9);
  });
});
