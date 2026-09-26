import { describe, expect, it } from 'vitest';
import type { BuildingMeta } from '@campus-map/core';
import { nodePlaceLabel, nodesCount } from '../src/utils/labels';

describe('nodesCount', () => {
  it.each([
    [1, '1 узел'],
    [2, '2 узла'],
    [4, '4 узла'],
    [5, '5 узлов'],
    [11, '11 узлов'],
    [12, '12 узлов'],
    [14, '14 узлов'],
    [21, '21 узел'],
    [22, '22 узла'],
    [111, '111 узлов'],
    [0, '0 узлов'],
  ])('%i → «%s»', (count, text) => {
    expect(nodesCount(count)).toBe(text);
  });
});

describe('где лежит узел', () => {
  const metas = new Map<string, BuildingMeta>([
    ['building_a', { id: 'building_a', name: 'Корпус А', floors: [{ floor: -1 }, { floor: 1 }, { floor: 1.5, label: '1А' }] }],
  ]);

  it('этаж — подписью с таблички, подвал — с минусом, территория — словом', () => {
    expect(nodePlaceLabel({ building: 'building_a', floor: 1.5 }, metas)).toBe('Корпус А, этаж 1А');
    expect(nodePlaceLabel({ building: 'building_a', floor: -1 }, metas)).toBe('Корпус А, этаж −1');
    expect(nodePlaceLabel({ building: 'building_a', floor: 1 }, metas)).toBe('Корпус А, этаж 1');
    expect(nodePlaceLabel({ building: 'CAMPUS', floor: 0 }, metas)).toBe('Территория');
  });
});
