import { describe, expect, it } from 'vitest';
import type { BuildingMeta, MapNode, Transition } from '@campus-map/core';
import { validateDataset } from '../src/utils/validateData';
import { fixtureDataset } from './helpers/fixture';

/** Фикстура в том виде, в каком её держит стор. */
function params() {
  const dataset = fixtureDataset();
  return {
    nodes: new Map<string, MapNode>(dataset.nodes.map((n) => [n.id, { ...n, neighbors: [...n.neighbors] }])),
    transitions: dataset.transitions.map((t): Transition => ({ ...t })),
    buildingMetas: new Map<string, BuildingMeta>(dataset.buildingMetas.map((m) => [m.id, m])),
  };
}

describe('validateDataset', () => {
  it('исправные данные — без ошибок и предупреждений', () => {
    expect(validateDataset(params())).toEqual({ errors: [], warnings: [] });
  });

  it('сосед, которого нет, — ошибка', () => {
    const p = params();
    p.nodes.get('a1_hall')!.neighbors.push('ghost');
    const { errors } = validateDataset(p);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('ghost');
  });

  it('связь только в одну сторону — ошибка: односторонних проходов нет', () => {
    const p = params();
    p.nodes.get('a1_room101')!.neighbors.push('a1_stairs');
    const { errors, warnings } = validateDataset(p);
    expect(warnings).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('a1_room101');
  });

  it('узел — сосед самому себе: ошибка; повтор соседа — предупреждение', () => {
    const p = params();
    p.nodes.get('a1_hall')!.neighbors.push('a1_hall', 'a1_stairs');
    const { errors, warnings } = validateDataset(p);
    expect(errors).toEqual(['Узел «a1_hall» указан соседом самому себе']);
    expect(warnings).toEqual(['У узла «a1_hall» один и тот же сосед указан несколько раз']);
  });

  it('переход к несуществующему узлу — ошибка по каждому концу', () => {
    const p = params();
    p.transitions.push({ fromNode: 'nowhere', toNode: 'gone', type: 'stairs' });
    expect(validateDataset(p).errors).toHaveLength(2);
  });

  it('узел этажа, которого нет в meta.json, — ошибка', () => {
    const p = params();
    p.nodes.set('a5_ghost', { id: 'a5_ghost', building: 'building_a', floor: 5, x: 0, y: 0, isPortal: false, neighbors: [] });
    const { errors } = validateDataset(p);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('этаж 5');
  });

  it('переход внутри одного плана — предупреждение', () => {
    const p = params();
    p.transitions.push({ fromNode: 'a1_hall', toNode: 'a1_room101', type: 'lift' });
    const { errors, warnings } = validateDataset(p);
    expect(errors).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('одного плана');
  });

  it('второй переход между теми же узлами — предупреждение', () => {
    const p = params();
    p.transitions.push({ fromNode: 'a2_stairs', toNode: 'a1_stairs', type: 'lift' });
    const { warnings } = validateDataset(p);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('больше одного перехода');
  });

  it('узел неизвестного корпуса — ошибка', () => {
    const p = params();
    p.nodes.set('z1_x', { id: 'z1_x', building: 'building_z', floor: 1, x: 0, y: 0, isPortal: false, neighbors: [] });
    expect(validateDataset(p).errors[0]).toContain('building_z');
  });
});
