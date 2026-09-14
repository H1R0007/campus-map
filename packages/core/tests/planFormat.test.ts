import { describe, expect, it } from 'vitest';
import {
  CAMPUS_GRAPH_PATH,
  CAMPUS_META_PATH,
  DEFAULT_PLAN_FORMAT,
  buildingMetaPath,
  campusMapPath,
  campusMapUrl,
  floorGraphPath,
  floorMapPath,
  floorMapUrl,
  isPlanFormat,
  loadDataset,
  planFormatOf,
} from '../src/index.js';
import { memorySource } from './helpers/memorySource.js';

/** Формат плана — PNG или SVG (запись 29). */

describe('формат плана', () => {
  it('без поля — PNG, как до его появления', () => {
    expect(DEFAULT_PLAN_FORMAT).toBe('png');
    expect(planFormatOf(undefined)).toBe('png');
    expect(planFormatOf({})).toBe('png');
    expect(floorMapPath('building_a', 2)).toBe('buildings/building_a/floors/2/map.png');
    expect(campusMapPath()).toBe('campus/map.png');
  });

  it('имя файла — map.<формат>', () => {
    expect(planFormatOf({ planFormat: 'svg' })).toBe('svg');
    expect(floorMapPath('building_a', 2, 'svg')).toBe('buildings/building_a/floors/2/map.svg');
    expect(campusMapPath('svg')).toBe('campus/map.svg');
    expect(floorMapUrl('building_a', -1, '/campus/data/', 'svg')).toBe('/campus/data/buildings/building_a/floors/-1/map.svg');
    expect(campusMapUrl('/data', 'svg')).toBe('/data/campus/map.svg');
  });

  it('принимает только известные форматы', () => {
    expect(isPlanFormat('svg')).toBe(true);
    expect(isPlanFormat('png')).toBe(true);
    expect(isPlanFormat('SVG')).toBe(false);
    expect(isPlanFormat('jpg')).toBe(false);
  });
});

describe('формат плана в загрузчике', () => {
  const files = (campus: Record<string, unknown>, floor: Record<string, unknown>) => ({
    [CAMPUS_META_PATH]: { buildings: [{ id: 'bA', name: 'Корпус А' }], mapSize: { width: 10, height: 10 }, ...campus },
    [CAMPUS_GRAPH_PATH]: { nodes: [] },
    [buildingMetaPath('bA')]: { id: 'bA', name: 'Корпус А', floors: [{ floor: 1, ...floor }] },
    [floorGraphPath('bA', 1)]: { nodes: [] },
  });
  const formatWarnings = (warnings: readonly string[]) => warnings.filter((w) => w.includes('planFormat'));

  it('читает формат плана территории и этажа', async () => {
    const { dataset, warnings } = await loadDataset(memorySource(files({ planFormat: 'svg' }, { planFormat: 'svg' })));

    expect(dataset.campusMeta.planFormat).toBe('svg');
    expect(dataset.buildingMetas[0].floors[0].planFormat).toBe('svg');
    expect(formatWarnings(warnings)).toEqual([]);
  });

  it('неизвестный формат отбрасывает с предупреждением', async () => {
    const { dataset, warnings } = await loadDataset(memorySource(files({ planFormat: 'jpg' }, { planFormat: 'SVG' })));

    expect(dataset.campusMeta.planFormat).toBeUndefined();
    expect(dataset.buildingMetas[0].floors[0].planFormat).toBeUndefined();
    expect(formatWarnings(warnings)).toHaveLength(2);
  });
});
