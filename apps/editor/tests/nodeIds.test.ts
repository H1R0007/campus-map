import { describe, expect, it } from 'vitest';
import { nodeIdForKind, nodeIdProblem, planPrefix } from '../src/utils/nodeIds';
import { buildingIdFor } from '../src/stores/editor/structureSlice';

const kind = (id: string) => ({ id, name: id });

describe('id новой точки', () => {
  it('приставка — буква корпуса и этаж, у территории — campus', () => {
    expect(planPrefix('building_a', 1)).toBe('a1');
    expect(planPrefix('building_b', 3)).toBe('b3');
    expect(planPrefix(null, null)).toBe('campus');
    expect(planPrefix('CAMPUS', 0)).toBe('campus');
  });

  it('id говорит, что это за точка', () => {
    expect(nodeIdForKind(kind('toilet'), 'building_a', 1, () => false)).toBe('a1_toilet');
    expect(nodeIdForKind(kind('room'), 'building_b', 2, () => false)).toBe('b2_room');
  });

  it('занятый id получает номер', () => {
    const taken = new Set(['a1_stairs', 'a1_stairs_2']);
    expect(nodeIdForKind(kind('stairs'), 'building_a', 1, (id) => taken.has(id))).toBe('a1_stairs_3');
  });

  it('без вида id всё равно называет план', () => {
    expect(nodeIdForKind(null, 'building_a', 1, () => false)).toBe('a1_node');
  });

  it('код корпуса с цифрой на конце отделён от этажа: не «sad5s31», а «sad5s3_1»', () => {
    expect(planPrefix('building_sad5s3', 1)).toBe('sad5s3_1');
    expect(planPrefix('building_g_2', 1)).toBe('g2_1');
    expect(nodeIdForKind(kind('room'), 'building_sad5s3', -1, () => false)).toBe('sad5s3_m1_room');
  });

  it('подвал и антресоль — без минуса и точки: такой id проходит собственную проверку', () => {
    expect(planPrefix('building_a', -1)).toBe('am1');
    expect(planPrefix('building_a', 1.5)).toBe('a1p5');
    for (const floor of [-2, -1, 0, 1.5, 12]) {
      const id = nodeIdForKind(kind('toilet'), 'building_a', floor, () => false);
      expect(nodeIdProblem(id, () => false, '')).toBeNull();
    }
  });
});

describe('код корпуса по названию', () => {
  it('буква корпуса — латиницей', () => {
    expect(buildingIdFor('Корпус Г', () => false)).toBe('building_g');
  });

  it('адрес со строением — коротко: улица, дом, строение', () => {
    expect(buildingIdFor('Садовая 5, стр. 3', () => false)).toBe('building_sad5s3');
    expect(buildingIdFor('Лесной Вал 3, стр. 1', () => false)).toBe('building_les3s1');
    expect(buildingIdFor('д. 6, стр. 2', () => false)).toBe('building_d6s2');
    expect(buildingIdFor('Садовая 5, строение 3а', () => false)).toBe('building_sad5s3a');
  });
});

describe('проверка нового id', () => {
  const taken = (id: string) => id === 'a1_hall';

  it('пустой id не годится', () => {
    expect(nodeIdProblem('  ', taken, 'a1_room')).toMatch(/пустым/);
  });

  it('свой же id — не занятость', () => {
    expect(nodeIdProblem('a1_hall', taken, 'a1_hall')).toBeNull();
  });

  it('чужой id занят', () => {
    expect(nodeIdProblem('a1_hall', taken, 'a1_room')).toMatch(/занят/);
  });

  it('русские буквы и пробелы не годятся', () => {
    expect(nodeIdProblem('а1 холл', taken, 'a1_room')).toMatch(/латиница/);
  });

  it('обычный id проходит', () => {
    expect(nodeIdProblem('a1_room101', taken, 'a1_room')).toBeNull();
  });
});
