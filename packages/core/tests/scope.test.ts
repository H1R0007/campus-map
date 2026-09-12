import { describe, expect, it } from 'vitest';
import {
  CAMPUS_BUILDING_ID,
  buildingDisplayName,
  isNodeInScope,
  scopeOfFloor,
  scopeOfNode,
} from '../src/index.js';
import type { MapNode } from '../src/index.js';

function node(id: string, building: string, floor: number): MapNode {
  return { id, x: 0, y: 0, building, floor, neighbors: [], isPortal: false };
}

/**
 * Область видимости карты.
 *
 * Правило «какие узлы показывать» одно на оба приложения: слои карты
 * навигатора и оверлеи редактора фильтруют узлы одинаково. Любое расхождение
 * привело бы к тому, что маршрут рисуется через стену, а узлы этажа
 * пропадают.
 */
describe('scopeOfFloor', () => {
  it('без выбранного корпуса даёт территорию кампуса', () => {
    expect(scopeOfFloor(null, null)).toEqual({ mode: 'campus' });
  });

  it('неполный выбор трактуется как кампус', () => {
    // Корпус задан, этаж ещё нет — промежуточное состояние переключения.
    expect(scopeOfFloor('building_a', null)).toEqual({ mode: 'campus' });
  });

  it('корпус с этажом дают область этажа', () => {
    expect(scopeOfFloor('building_a', 3)).toEqual({
      mode: 'floor',
      buildingId: 'building_a',
      floor: 3,
    });
  });

  it('нулевой этаж корпуса — это область этажа, а не кампус', () => {
    expect(scopeOfFloor('building_a', 0)).toEqual({
      mode: 'floor',
      buildingId: 'building_a',
      floor: 0,
    });
  });
});

describe('isNodeInScope', () => {
  const campusNode = node('gate', CAMPUS_BUILDING_ID, 0);
  const floorNode = node('a3_room301', 'building_a', 3);

  it('в области кампуса видны только узлы территории', () => {
    const scope = scopeOfFloor(null, null);

    expect(isNodeInScope(campusNode, scope)).toBe(true);
    expect(isNodeInScope(floorNode, scope)).toBe(false);
  });

  it('в области этажа видны узлы ровно этого этажа', () => {
    const scope = scopeOfFloor('building_a', 3);

    expect(isNodeInScope(floorNode, scope)).toBe(true);
    expect(isNodeInScope(campusNode, scope)).toBe(false);
    expect(isNodeInScope(node('a2', 'building_a', 2), scope)).toBe(false);
    expect(isNodeInScope(node('b3', 'building_b', 3), scope)).toBe(false);
  });

  it('неопределённая область не показывает ничего', () => {
    // Безопасное поведение для промежуточных состояний загрузки.
    expect(isNodeInScope(campusNode, null)).toBe(false);
    expect(isNodeInScope(floorNode, null)).toBe(false);
  });
});

describe('scopeOfNode', () => {
  it('узел кампуса отображается в область кампуса', () => {
    expect(scopeOfNode(node('gate', CAMPUS_BUILDING_ID, 0))).toEqual({ mode: 'campus' });
  });

  it('узел этажа отображается в область своего этажа', () => {
    expect(scopeOfNode(node('r', 'building_b', 2))).toEqual({
      mode: 'floor',
      buildingId: 'building_b',
      floor: 2,
    });
  });

  it('обратимо с isNodeInScope', () => {
    const someNode = node('r', 'building_c', 1);

    expect(isNodeInScope(someNode, scopeOfNode(someNode))).toBe(true);
  });
});

describe('buildingDisplayName', () => {
  const names = new Map([['building_a', 'Корпус А']]);

  it('для территории кампуса возвращает фиксированное имя', () => {
    expect(buildingDisplayName(CAMPUS_BUILDING_ID, names)).toBe('Кампус');
  });

  it('берет имя из метаданных', () => {
    expect(buildingDisplayName('building_a', names)).toBe('Корпус А');
  });

  it('при отсутствии имени показывает идентификатор', () => {
    expect(buildingDisplayName('building_z', names)).toBe('building_z');
  });
});
