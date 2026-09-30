import { describe, expect, it } from 'vitest';
import { createCampusProjection } from '@campus-map/core';
import { applySimilarity } from '../src/import/planGeometry';
import {
  frameCenter,
  frameOf,
  initialFrame,
  moveFrame,
  placementOf,
  rescalePlacement,
  rotateFrame,
  scaleFrame,
  withScaleAndRotation,
} from '../src/import/placementMath';

/**
 * Постановка плана на территорию (запись 50): подобие на экране и привязка в
 * данных — одно и то же, а навигатор ставит точку туда же, куда её видит
 * редактор.
 */

const close = (actual: { x: number; y: number }, expected: { x: number; y: number }) => {
  expect(actual.x).toBeCloseTo(expected.x, 6);
  expect(actual.y).toBeCloseTo(expected.y, 6);
};

describe('экран и данные', () => {
  const placement = { metersPerPixel: 0.1, originMeters: { x: 30, y: 40 }, rotationDeg: 20 };
  const campusMpp = 0.5;

  it('туда и обратно — та же привязка', () => {
    expect(placementOf(frameOf(placement, campusMpp), campusMpp)).toEqual(placement);
  });

  it('точка плана встаёт туда же, куда её ставит проекция ядра', () => {
    const projection = createCampusProjection(
      { buildings: [{ id: 'b' }], mapSize: { width: 800, height: 600 }, metersPerPixel: campusMpp },
      [{ id: 'b', name: 'Б', placement: { ...placement, baseElevationMeters: 0, floorHeightMeters: 3 }, floors: [{ floor: 1 }] }]
    );
    const world = projection.toWorld({ building: 'b', floor: 1, x: 120, y: 45 })!;
    const onScreen = applySimilarity(frameOf(placement, campusMpp), { x: 120, y: 45 });
    close({ x: onScreen.x * campusMpp, y: onScreen.y * campusMpp }, world);
  });
});

describe('ручки постановки', () => {
  const size = { width: 400, height: 200 };
  const start = initialFrame(size, { center: { x: 500, y: 300 }, width: 1200 });

  it('первая постановка — посередине видимого, шириной в треть', () => {
    close(frameCenter(start, size), { x: 500, y: 300 });
    expect(applySimilarity(start, { x: 400, y: 0 }).x - applySimilarity(start, { x: 0, y: 0 }).x).toBeCloseTo(400, 6);
  });

  it('поворот и масштаб вокруг центра центр не сдвигают', () => {
    const center = frameCenter(start, size);
    close(frameCenter(rotateFrame(start, center, 33), size), center);
    close(frameCenter(scaleFrame(start, center, 1.7), size), center);
    const turned = rotateFrame(start, center, 90);
    // Правый край плана после поворота на 90° по часовой — внизу.
    const right = applySimilarity(turned, { x: 400, y: 100 });
    expect(right.y).toBeGreaterThan(center.y + 100);
  });

  it('поля ввода: масштаб и угол — ровно заданные, центр на месте', () => {
    const next = withScaleAndRotation(moveFrame(start, 10, -20), size, 2, -15);
    close(frameCenter(next, size), { x: 510, y: 280 });
    const placement = placementOf(next, 1);
    expect(placement.metersPerPixel).toBeCloseTo(2, 6);
    expect(placement.rotationDeg).toBeCloseTo(-15, 6);
  });
});

it('новый масштаб территории оставляет корпус на том же месте картинки', () => {
  const placement = { metersPerPixel: 0.1, originMeters: { x: 30, y: 40 }, rotationDeg: 20, floorHeightMeters: 3.6 };
  const before = applySimilarity(frameOf(placement, 0.5), { x: 50, y: 60 });
  const rescaled = rescalePlacement(placement, 0.8 / 0.5);
  const after = applySimilarity(frameOf(rescaled, 0.8), { x: 50, y: 60 });
  close(after, before);
  expect(rescaled.floorHeightMeters).toBe(3.6);
});
