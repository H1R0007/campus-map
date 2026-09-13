import { describe, expect, it } from 'vitest';
import { CAMPUS_BUILDING_ID, CAMPUS_FLOOR, createCampusProjection } from '../src/index.js';
import type { BuildingMeta, CampusMeta, MapNode } from '../src/index.js';

/**
 * Перевод пикселей планов в метрическое пространство кампуса.
 *
 * От этой проекции зависят время в пути и эвристика поиска, а ошибки в ней
 * не видны глазом: неверный поворот или отметка дают правдоподобные, но
 * ложные минуты. Поэтому соглашения — направление поворота, точка отсчёта
 * отметок, отказ от значений по умолчанию — закреплены здесь явно.
 */

const CAMPUS: CampusMeta = {
  buildings: [{ id: 'bA' }],
  mapSize: { width: 100, height: 100 },
  metersPerPixel: 0.5,
};

function building(overrides: Partial<BuildingMeta> = {}): BuildingMeta {
  return {
    id: 'bA',
    name: 'Корпус А',
    placement: {
      metersPerPixel: 0.1,
      originMeters: { x: 100, y: 50 },
      rotationDeg: 0,
      baseElevationMeters: 0,
      floorHeightMeters: 4,
    },
    floors: [{ floor: 1 }, { floor: 2 }],
    ...overrides,
  };
}

function at(buildingId: string, floor: number, x: number, y: number): Pick<MapNode, 'building' | 'floor' | 'x' | 'y'> {
  return { building: buildingId, floor, x, y };
}

describe('createCampusProjection: режим', () => {
  it('полная привязка — метрический режим', () => {
    const projection = createCampusProjection(CAMPUS, [building()]);

    expect(projection.mode).toBe('metric');
    expect(projection.unplacedFloors).toEqual([]);
  });

  it('без привязки — пиксельный режим, и ни одна точка не проецируется', () => {
    const projection = createCampusProjection(
      { ...CAMPUS, metersPerPixel: undefined },
      [building({ placement: undefined })]
    );

    expect(projection.mode).toBe('pixel');
    expect(projection.toWorld(at(CAMPUS_BUILDING_ID, CAMPUS_FLOOR, 10, 10))).toBeNull();
  });

  it('масштаб территории по умолчанию не подставляется', () => {
    // Корпус привязан полностью, но без масштаба территории пространства нет:
    // единица «1 метр на пиксель» сложила бы корпуса в начало координат.
    const projection = createCampusProjection({ ...CAMPUS, metersPerPixel: undefined }, [building()]);

    expect(projection.mode).toBe('pixel');
    expect(projection.unplacedFloors).toEqual([
      { buildingId: CAMPUS_BUILDING_ID, floor: CAMPUS_FLOOR, missing: ['metersPerPixel'] },
    ]);
    // Привязанный корпус тоже не проецируется: режимы не смешиваются.
    expect(projection.toWorld(at('bA', 1, 0, 0))).toBeNull();
  });

  it('один непривязанный этаж переводит в пиксельный режим весь датасет и называет, чего не хватает', () => {
    const projection = createCampusProjection(CAMPUS, [
      building({
        placement: { metersPerPixel: 0.1, originMeters: { x: 0, y: 0 } },
        floors: [{ floor: 1, placement: { rotationDeg: 0 }, elevationMeters: 0 }, { floor: 2 }],
      }),
    ]);

    expect(projection.mode).toBe('pixel');
    expect(projection.unplacedFloors).toEqual([
      {
        buildingId: 'bA',
        floor: 2,
        missing: ['rotationDeg', expect.stringContaining('elevationMeters')],
      },
    ]);
  });

  it('этаж без привязки корпуса, но со своей полной привязкой — привязан', () => {
    const projection = createCampusProjection(CAMPUS, [
      building({
        placement: undefined,
        floors: [
          {
            floor: 1,
            placement: { metersPerPixel: 0.2, originMeters: { x: 10, y: 20 }, rotationDeg: 0 },
            elevationMeters: 1.5,
          },
        ],
      }),
    ]);

    expect(projection.mode).toBe('metric');
    expect(projection.toWorld(at('bA', 1, 5, 5))).toEqual({ x: 11, y: 21, z: 1.5 });
  });
});

describe('createCampusProjection: координаты', () => {
  it('территория: пиксели умножаются на масштаб, отметка нулевая', () => {
    const projection = createCampusProjection(CAMPUS, [building()]);

    expect(projection.toWorld(at(CAMPUS_BUILDING_ID, CAMPUS_FLOOR, 10, 20))).toEqual({ x: 5, y: 10, z: 0 });
  });

  it('план корпуса масштабируется и сдвигается на originMeters', () => {
    const projection = createCampusProjection(CAMPUS, [building()]);

    expect(projection.toWorld(at('bA', 1, 30, 40))).toEqual({ x: 103, y: 54, z: 0 });
  });

  it('поворот — по часовой стрелке, как на экране, вокруг левого верхнего угла плана', () => {
    const base = building();
    const projection = createCampusProjection(CAMPUS, [
      building({ placement: { ...base.placement, metersPerPixel: 1, rotationDeg: 90 } }),
    ]);

    // Ось y плана направлена вниз. Точка правее угла после поворота по часовой
    // стрелке оказывается ниже него, точка ниже угла — левее.
    const right = projection.toWorld(at('bA', 1, 10, 0));
    const below = projection.toWorld(at('bA', 1, 0, 10));

    expect(right?.x).toBeCloseTo(100, 9);
    expect(right?.y).toBeCloseTo(60, 9);
    expect(below?.x).toBeCloseTo(90, 9);
    expect(below?.y).toBeCloseTo(50, 9);
  });

  it('расстояния на плане сохраняются с точностью до масштаба — привязка есть подобие', () => {
    const base = building();
    const projection = createCampusProjection(CAMPUS, [
      building({ placement: { ...base.placement, metersPerPixel: 0.25, rotationDeg: 37 } }),
    ]);

    const a = projection.toWorld(at('bA', 1, 120, 80));
    const b = projection.toWorld(at('bA', 1, 420, 480));
    if (a === null || b === null) throw new Error('точки должны проецироваться');

    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(0.25 * Math.hypot(300, 400), 9);
  });

  it('отметка этажа: baseElevationMeters + (n − 1) · floorHeightMeters', () => {
    const base = building();
    const projection = createCampusProjection(CAMPUS, [
      building({
        placement: { ...base.placement, baseElevationMeters: 1.2, floorHeightMeters: 4 },
        floors: [{ floor: -1 }, { floor: 0 }, { floor: 1 }, { floor: 3 }],
      }),
    ]);

    // Формула считает по номеру этажа, а не по порядку в списке: этажа 2 в
    // данных нет, но этаж 3 от этого не опускается.
    expect(projection.toWorld(at('bA', 1, 0, 0))?.z).toBeCloseTo(1.2, 9);
    expect(projection.toWorld(at('bA', 3, 0, 0))?.z).toBeCloseTo(9.2, 9);
    expect(projection.toWorld(at('bA', 0, 0, 0))?.z).toBeCloseTo(-2.8, 9);
    expect(projection.toWorld(at('bA', -1, 0, 0))?.z).toBeCloseTo(-6.8, 9);
  });

  it('elevationMeters этажа важнее формулы корпуса', () => {
    // Нумерация без нулевого этажа: подвал −1 лежит сразу под первым, а
    // формула по номеру опустила бы его на два этажа.
    const projection = createCampusProjection(CAMPUS, [
      building({ floors: [{ floor: -1, elevationMeters: -4 }, { floor: 1 }] }),
    ]);

    expect(projection.toWorld(at('bA', -1, 0, 0))?.z).toBe(-4);
  });

  it('привязка этажа переопределяет только заданные поля', () => {
    const projection = createCampusProjection(CAMPUS, [
      building({ floors: [{ floor: 1 }, { floor: 2, placement: { originMeters: { x: 0, y: 0 } } }] }),
    ]);

    // Масштаб и поворот этаж 2 берёт у корпуса, сдвиг — свой.
    expect(projection.toWorld(at('bA', 2, 10, 10))).toEqual({ x: 1, y: 1, z: 4 });
    expect(projection.toWorld(at('bA', 1, 10, 10))).toEqual({ x: 101, y: 51, z: 0 });
  });

  it('узел этажа, не объявленного в метаданных, не проецируется', () => {
    const projection = createCampusProjection(CAMPUS, [building()]);

    expect(projection.toWorld(at('bA', 7, 0, 0))).toBeNull();
    expect(projection.toWorld(at('bZ', 1, 0, 0))).toBeNull();
  });
});
