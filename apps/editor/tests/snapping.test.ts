import { describe, expect, it } from 'vitest';
import type { MapNode } from '@campus-map/core';
import { SNAP_SCREEN_PX, snapToNeighbours } from '../src/utils/snapping';

const node = (id: string, x: number, y: number): MapNode => ({
  id,
  x,
  y,
  building: 'building_a',
  floor: 1,
  neighbors: [],
  isPortal: false,
});

const plan = [node('a', 100, 100), node('b', 300, 260)];

describe('выравнивание новой точки по соседям', () => {
  it('почти совпавшая координата подтягивается к соседу', () => {
    const result = snapToNeighbours(plan, 104, 258, 1);

    expect(result.x).toBe(100);
    expect(result.y).toBe(260);
    expect(result.alignedX?.id).toBe('a');
    expect(result.alignedY?.id).toBe('b');
  });

  it('далёкая координата остаётся как есть', () => {
    const result = snapToNeighbours(plan, 180, 200, 1);

    expect(result).toEqual({ x: 180, y: 200, alignedX: null, alignedY: null });
  });

  it('допуск задан в пикселях экрана: на отдалённом плане он шире в пикселях плана', () => {
    // Приближение вдвое меньше — те же 12 пикселей экрана покрывают 24 плана.
    const far = snapToNeighbours(plan, 100 + SNAP_SCREEN_PX + 4, 500, 0.5);
    const close = snapToNeighbours(plan, 100 + SNAP_SCREEN_PX + 4, 500, 2);

    expect(far.x).toBe(100);
    expect(close.x).toBe(100 + SNAP_SCREEN_PX + 4);
  });

  it('без точек на плане выравнивать не по чему', () => {
    expect(snapToNeighbours([], 10, 20, 1)).toEqual({ x: 10, y: 20, alignedX: null, alignedY: null });
  });
});
