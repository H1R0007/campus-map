import { describe, expect, it } from 'vitest';
import type { BuildingMeta } from '@campus-map/core';
import { entranceFloorOf, floorsOfBuilding } from '../src/stores/mapStore';

/**
 * Выбор этажа при переходе с карты кампуса.
 */

function meta(floors: number[]): BuildingMeta {
  return {
    id: 'building_x',
    name: 'Корпус Х',
    floors: floors.map((floor) => ({ floor, mapPath: 'map.png', graphPath: 'graph.json' })),
  };
}

describe('floorsOfBuilding', () => {
  it('сортирует этажи сверху вниз — в порядке отрисовки панели', () => {
    expect(floorsOfBuilding(meta([1, 3, 2]))).toEqual([3, 2, 1]);
  });

  it('без метаданных возвращает пустой список', () => {
    expect(floorsOfBuilding(undefined)).toEqual([]);
  });
});

describe('entranceFloorOf', () => {
  it('обычный корпус — первый этаж', () => {
    expect(entranceFloorOf(meta([1, 2, 3]))).toBe(1);
  });

  it('корпус с подвалом — всё равно первый этаж, а не подвал', () => {
    // Ровно тот случай, ради которого правило и появилось: низший этаж здесь
    // −1, и студент попадал бы в подвал вместо входной группы.
    expect(entranceFloorOf(meta([-1, 1, 2, 3]))).toBe(1);
  });

  it('несколько подземных уровней не меняют ответа', () => {
    expect(entranceFloorOf(meta([-2, -1, 0, 1, 2]))).toBe(1);
  });

  it('нумерация с нуля: нулевой этаж не считается надземным', () => {
    // В европейской нумерации «0» — это первый этаж, но без явного признака
    // в данных различить её нельзя. Берём ближайший к поверхности сверху.
    expect(entranceFloorOf(meta([0, 1, 2]))).toBe(1);
  });

  it('целиком подземный объект — верхний из его этажей', () => {
    expect(entranceFloorOf(meta([-3, -2, -1]))).toBe(-1);
  });

  it('без метаданных — первый этаж', () => {
    expect(entranceFloorOf(undefined)).toBe(1);
  });

  it('пустой список этажей — первый этаж', () => {
    expect(entranceFloorOf(meta([]))).toBe(1);
  });
});
