import { describe, expect, it } from 'vitest';
import { Graph, createCampusProjection } from '@campus-map/core';
import type { BuildingMeta, CampusMeta } from '@campus-map/core';
import { canvasLayoutOf } from '../src/utils/canvasLayout';
import { FIXTURE_NODES, FIXTURE_TRANSITIONS } from './helpers/graphFixture';

/**
 * Раскладка холста кампуса: где стоят планы и контуры корпусов (запись 32).
 */

const CAMPUS: CampusMeta = {
  buildings: [{ id: 'building_a' }],
  mapSize: { width: 400, height: 200 },
  metersPerPixel: 0.5,
  planFormat: 'svg',
};

function building(overrides: Partial<BuildingMeta> = {}): BuildingMeta {
  return {
    id: 'building_a',
    name: 'Корпус А',
    entranceFloor: 1,
    placement: { metersPerPixel: 0.1, originMeters: { x: 30, y: 40 }, rotationDeg: 90, baseElevationMeters: 0, floorHeightMeters: 3 },
    floors: [
      { floor: 1, mapSize: { width: 600, height: 200 }, planFormat: 'svg' },
      { floor: 2, mapSize: { width: 600, height: 200 } },
    ],
    ...overrides,
  };
}

function layoutOf(meta: BuildingMeta) {
  const graph = new Graph(FIXTURE_NODES, FIXTURE_TRANSITIONS, createCampusProjection(CAMPUS, [meta]));
  return canvasLayoutOf(graph, CAMPUS, new Map([[meta.id, meta]]), '/data/');
}

const rounded = (points: readonly { x: number; y: number }[]) =>
  points.map((point) => [Math.round(point.x * 1e6) / 1e6, Math.round(point.y * 1e6) / 1e6]);

describe('раскладка холста кампуса', () => {
  it('план территории стоит от левого верхнего угла, формат — из метаданных', () => {
    expect(layoutOf(building()).campus).toEqual({
      url: '/data/campus/map.svg',
      format: 'svg',
      placement: { metersPerPixel: 0.5, originMeters: { x: 0, y: 0 }, rotationDeg: 0 },
      size: { width: 400, height: 200 },
    });
  });

  it('контур корпуса — план входного этажа на территории, с поворотом', () => {
    const [a] = layoutOf(building()).buildings;

    // 600×200 пикселей по 0,1 м, поворот на 90° по часовой: длинная сторона
    // уходит вниз от угла (30, 40).
    expect(rounded(a.footprint)).toEqual([
      [30, 40],
      [30, 100],
      [10, 100],
      [10, 40],
    ]);
    expect(a.span).toBeCloseTo(60, 9);
    expect(a.floors.get(1)?.url).toBe('/data/buildings/building_a/floors/1/map.svg');
    expect(a.floors.get(2)?.url).toBe('/data/buildings/building_a/floors/2/map.png');
  });

  it('без размера плана контур — прямоугольник вокруг узлов входного этажа', () => {
    const meta = building({
      placement: { metersPerPixel: 0.5, originMeters: { x: 0, y: 0 }, rotationDeg: 0, baseElevationMeters: 0, floorHeightMeters: 3 },
      floors: [{ floor: 1 }, { floor: 2 }],
    });
    const [a] = layoutOf(meta).buildings;

    expect(rounded(a.footprint)).toEqual([
      [100, 150],
      [135, 150],
      [135, 175],
      [100, 175],
    ]);
    expect(a.span).toBeCloseTo(35, 9);
  });

  it('габариты холста охватывают и территорию, и корпус за её краем', () => {
    const meta = building({
      placement: { metersPerPixel: 0.1, originMeters: { x: 190, y: 90 }, rotationDeg: 0, baseElevationMeters: 0, floorHeightMeters: 3 },
    });

    expect(layoutOf(meta).extent).toEqual({ minX: 0, minY: 0, maxX: 250, maxY: 110 });
  });
});
