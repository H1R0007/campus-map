import { beforeEach, describe, expect, it } from 'vitest';
import { createCampusProjection } from '@campus-map/core';
import { applySimilarity } from '../src/import/planGeometry';
import { frameOf } from '../src/import/placementMath';
import { useHistoryStore } from '../src/stores/historyStore';
import { fixtureDataset, loadFixture, store } from './helpers/fixture';

/**
 * Постановка корпуса на территорию и масштаб территории (запись 50).
 */

beforeEach(() => loadFixture());

const VIEW = { center: { x: 400, y: 300 }, width: 800 };

describe('постановка', () => {
  it('поставленный корпус открывается там, где стоит', () => {
    expect(store().startPlacing('building_a', VIEW)).toBeNull();
    const { placing, campusMeta, buildingMetas } = store();
    const expected = frameOf(buildingMetas.get('building_a')!.placement as never, campusMeta!.metersPerPixel!);
    expect(placing?.frame).toEqual(expected);
    expect(placing?.floor).toBe(1);
    // Постановка — на территории.
    expect([store().currentBuilding, store().currentFloor]).toEqual([null, null]);
  });

  it('новый корпус кладётся посередине видимого', () => {
    store().addBuilding('Корпус Г');
    store().addFloor('building_g', { floor: 1, plan: { key: 'sha1:' + '1'.repeat(40), format: 'png', mapSize: { width: 400, height: 200 } } });
    store().startPlacing('building_g', VIEW);
    const center = applySimilarity(store().placing!.frame, { x: 200, y: 100 });
    expect(center.x).toBeCloseTo(400, 6);
    expect(center.y).toBeCloseTo(300, 6);
  });

  it('без масштаба территории и без этажей — нельзя, с объяснением', () => {
    const dataset = fixtureDataset();
    delete dataset.campusMeta.metersPerPixel;
    loadFixture(dataset);
    expect(store().startPlacing('building_a', VIEW)).toMatch(/масштаб территории/);
    loadFixture();
    store().addBuilding('Корпус Г');
    expect(store().startPlacing('building_g', VIEW)).toMatch(/нет этажей/);
  });

  it('пары: место на плане корпуса, затем на территории; две пары ставят корпус', () => {
    store().startPlacing('building_a', VIEW);
    store().setPairMode(true);
    const frame = store().placing!.frame;
    // Места на плане корпуса — там, где они видны сейчас; на территории — со сдвигом.
    const a = applySimilarity(frame, { x: 0, y: 0 });
    const b = applySimilarity(frame, { x: 400, y: 200 });
    store().placingClick(a.x, a.y);
    store().placingClick(a.x + 10, a.y + 5);
    store().placingClick(b.x, b.y);
    store().placingClick(b.x + 10, b.y + 5);

    const moved = store().placing!.frame;
    const corner = applySimilarity(moved, { x: 0, y: 0 });
    expect(corner.x).toBeCloseTo(a.x + 10, 6);
    expect(corner.y).toBeCloseTo(a.y + 5, 6);
  });

  it('«Применить» — одна правка, точки корпуса встают на территории туда, где их видно', () => {
    store().startPlacing('building_a', VIEW);
    const frame = { ...store().placing!.frame, tx: store().placing!.frame.tx + 20 };
    store().setPlacingFrame(frame);
    store().applyPlacing();

    expect(store().placing).toBeNull();
    expect(useHistoryStore.getState().entries).toHaveLength(1);
    expect(useHistoryStore.getState().entries[0].description).toBe('Корпус «Корпус А» передвинут на территорию');
    const { campusMeta, buildingMetas } = store();
    const projection = createCampusProjection(campusMeta!, buildingMetas.values());
    const world = projection.toWorld({ building: 'building_a', floor: 1, x: 100, y: 120 })!;
    const onScreen = applySimilarity(frame, { x: 100, y: 120 });
    expect(world.x).toBeCloseTo(onScreen.x * campusMeta!.metersPerPixel!, 3);
    expect(world.y).toBeCloseTo(onScreen.y * campusMeta!.metersPerPixel!, 3);

    store().undo();
    expect(store().buildingMetas.get('building_a')!.placement!.originMeters).toEqual({ x: 30, y: 40 });
  });

  it('новый корпус получает высоты этажей по умолчанию — иначе навигатор не посчитает время', () => {
    store().addBuilding('Корпус Г');
    store().addFloor('building_g', { floor: 1 });
    store().startPlacing('building_g', VIEW);
    store().applyPlacing();
    expect(store().buildingMetas.get('building_g')!.placement).toMatchObject({ baseElevationMeters: 0, floorHeightMeters: 3.6 });
  });

  it('другой план открыли — постановка закончилась', () => {
    store().startPlacing('building_a', VIEW);
    store().setCurrentBuilding('building_a');
    expect(store().placing).toBeNull();
  });
});

describe('масштаб территории', () => {
  it('два места и метры', () => {
    store().startMeasuring();
    store().measureClick(0, 0);
    store().measureClick(300, 400);
    expect(store().applyMeasuring(250)).toBeNull();
    expect(store().campusMeta!.metersPerPixel).toBe(0.5);
    expect(store().measuring).toBeNull();
  });

  it('корпуса остаются на тех же местах картинки территории', () => {
    const before = frameOf(store().buildingMetas.get('building_a')!.placement as never, 0.5);
    store().startMeasuring();
    store().measureClick(0, 0);
    store().measureClick(100, 0);
    store().applyMeasuring(80);
    const scale = store().campusMeta!.metersPerPixel!;
    expect(scale).toBe(0.8);
    const after = frameOf(store().buildingMetas.get('building_a')!.placement as never, scale);
    const point = { x: 100, y: 120 };
    const a = applySimilarity(before, point);
    const b = applySimilarity(after, point);
    expect(b.x).toBeCloseTo(a.x, 6);
    expect(b.y).toBeCloseTo(a.y, 6);
    // Одна правка — одна отмена.
    expect(useHistoryStore.getState().entries).toHaveLength(1);
  });

  it('третий щелчок — замер заново; неверные метры — отказ', () => {
    store().startMeasuring();
    store().measureClick(0, 0);
    store().measureClick(10, 0);
    store().measureClick(50, 50);
    expect(store().measuring!.points).toEqual([{ x: 50, y: 50 }]);
    store().measureClick(50, 50.5);
    expect(store().applyMeasuring(10)).toMatch(/слишком близко/);
    store().measureClick(0, 0);
    store().measureClick(100, 0);
    expect(store().applyMeasuring(-5)).toMatch(/положительное/);
  });
});
