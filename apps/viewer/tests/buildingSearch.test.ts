import { describe, expect, it } from 'vitest';
import type { BuildingMeta, CampusMeta } from '@campus-map/core';
import { matchingBuildings } from '../src/utils/buildingSearch';

/** Поиск корпуса по названию на любом языке. */
const campus = { buildings: [{ id: 'building_a' }, { id: 'building_b' }, { id: 'building_c', name: 'Спорткомплекс' }] } as unknown as CampusMeta;
const metas = new Map<string, BuildingMeta>([
  ['building_a', { id: 'building_a', name: 'Корпус А', translations: { en: { name: 'Building A' } } } as unknown as BuildingMeta],
  ['building_b', { id: 'building_b', name: 'Корпус Б', translations: { en: { name: 'Building B' } } } as unknown as BuildingMeta],
]);

describe('matchingBuildings', () => {
  it('название без учёта регистра и лишних пробелов', () => {
    expect(matchingBuildings('корпус  б', campus, metas)).toEqual(['building_b']);
    expect(matchingBuildings('КОРПУС', campus, metas)).toEqual(['building_a', 'building_b']);
  });

  it('перевод названия и корпус без метаданных — по имени из описания кампуса', () => {
    expect(matchingBuildings('building a', campus, metas)).toEqual(['building_a']);
    expect(matchingBuildings('спорт', campus, metas)).toEqual(['building_c']);
  });

  it('пустой запрос и номер аудитории корпусов не находят', () => {
    expect(matchingBuildings('   ', campus, metas)).toEqual([]);
    expect(matchingBuildings('305', campus, metas)).toEqual([]);
  });
});
