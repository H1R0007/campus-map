import { describe, expect, it } from 'vitest';
import { CAMPUS_GRAPH_PATH, CAMPUS_META_PATH, buildingMetaPath, floorGraphPath, loadDataset } from '../src/index.js';
import { memorySource } from './helpers/memorySource.js';

/**
 * Запись об исходнике плана (запись 46): откуда взят план и как обработан.
 * Битая запись отбрасывается целиком с предупреждением — план в данных от
 * этого не страдает.
 */

const PDF = '3f2a9c1b04de7a1c.pdf';

const files = (campusSource: unknown, floorSource: unknown) => ({
  [CAMPUS_META_PATH]: {
    buildings: [{ id: 'bA', name: 'Корпус А' }],
    mapSize: { width: 10, height: 10 },
    ...(campusSource === undefined ? {} : { source: campusSource }),
  },
  [CAMPUS_GRAPH_PATH]: { nodes: [] },
  [buildingMetaPath('bA')]: {
    id: 'bA',
    name: 'Корпус А',
    floors: [{ floor: 1, ...(floorSource === undefined ? {} : { source: floorSource }) }],
  },
  [floorGraphPath('bA', 1)]: { nodes: [] },
});

const load = async (campusSource: unknown, floorSource: unknown) => {
  const { dataset, warnings } = await loadDataset(memorySource(files(campusSource, floorSource)));
  return {
    campus: dataset.campusMeta.source,
    floor: dataset.buildingMetas[0].floors[0].source,
    warnings: warnings.filter((warning) => warning.includes('исходник')),
  };
};

describe('исходник плана в загрузчике', () => {
  it('читает полную запись этажа и территории', async () => {
    const full = {
      file: PDF,
      name: 'Корпус А.pdf',
      page: 2,
      pageSize: { width: 842, height: 595 },
      rotation: 90,
      crop: { x: 10, y: 20, width: 500, height: 400 },
    };
    const { campus, floor, warnings } = await load({ file: 'a1b2c3d4.jpg', pageSize: { width: 4000, height: 3000 } }, full);

    expect(floor).toEqual(full);
    expect(campus).toEqual({ file: 'a1b2c3d4.jpg', pageSize: { width: 4000, height: 3000 } });
    expect(warnings).toEqual([]);
  });

  it('без записи — нет и поля', async () => {
    const { campus, floor, warnings } = await load(undefined, undefined);
    expect(campus).toBeUndefined();
    expect(floor).toBeUndefined();
    expect(warnings).toEqual([]);
  });

  it('нулевой поворот не хранится', async () => {
    const { floor } = await load(undefined, { file: PDF, pageSize: { width: 842, height: 595 }, rotation: 0 });
    expect(floor).toEqual({ file: PDF, pageSize: { width: 842, height: 595 } });
  });

  it.each([
    ['путь вместо имени', { file: '../secret.pdf', pageSize: { width: 1, height: 1 } }],
    ['имя не отпечаток', { file: 'Корпус А.pdf', pageSize: { width: 1, height: 1 } }],
    ['без размера страницы', { file: PDF }],
    ['страница не номер', { file: PDF, pageSize: { width: 1, height: 1 }, page: 1.5 }],
    ['страница ноль', { file: PDF, pageSize: { width: 1, height: 1 }, page: 0 }],
    ['страница строкой', { file: PDF, pageSize: { width: 1, height: 1 }, page: '2' }],
    ['запись не объект', PDF],
    ['поворот не число', { file: PDF, pageSize: { width: 1, height: 1 }, rotation: 'вправо' }],
    ['обрезка нулевой ширины', { file: PDF, pageSize: { width: 1, height: 1 }, crop: { x: 0, y: 0, width: 0, height: 5 } }],
    ['обрезка без поля', { file: PDF, pageSize: { width: 1, height: 1 }, crop: { x: 0, y: 0, width: 5 } }],
  ])('битая запись (%s) отбрасывается целиком с предупреждением', async (_why, source) => {
    const { floor, warnings } = await load(undefined, source);
    expect(floor).toBeUndefined();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('bA');
  });

  it('битая запись территории тоже называется', async () => {
    const { campus, warnings } = await load({ file: PDF }, undefined);
    expect(campus).toBeUndefined();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain(CAMPUS_META_PATH);
  });
});
