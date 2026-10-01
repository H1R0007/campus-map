import { beforeEach, describe, expect, it } from 'vitest';
import { createCampusProjection } from '@campus-map/core';
import { applySimilarity } from '../src/import/planGeometry';
import { farCorner, frameOf, moveFrame, turnAroundPin } from '../src/import/placementMath';
import { placingAllowsScale } from '../src/stores/editor/placeSlice';
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

  it('булавка (запись 63): угол приколот, дальний угол ведут к месту — план доворачивается вокруг булавки', () => {
    store().startPlacing('building_a', VIEW);
    const { frame, planSize } = store().placing!;
    const pin = applySimilarity(frame, { x: 0, y: 0 });
    store().setPlacingPin(pin);
    expect(store().placing!.pin!.plan.x).toBeCloseTo(0, 6);
    expect(store().placing!.pin!.plan.y).toBeCloseTo(0, 6);

    const far = farCorner(frame, planSize, pin);
    expect(far).toEqual(applySimilarity(frame, { x: planSize.width, y: planSize.height }));
    const target = { x: far.x + 20, y: far.y - 30 };
    store().setPlacingFrame(turnAroundPin({ frame, at: far }, pin, target, placingAllowsScale(store().placing!)));

    const moved = store().placing!.frame;
    const pinned = applySimilarity(moved, { x: 0, y: 0 });
    const reached = applySimilarity(moved, { x: planSize.width, y: planSize.height });
    expect(pinned.x).toBeCloseTo(pin.x, 6);
    expect(pinned.y).toBeCloseTo(pin.y, 6);
    expect(reached.x).toBeCloseTo(target.x, 6);
    expect(reached.y).toBeCloseTo(target.y, 6);
    // Доворот вокруг булавки её не снимает.
    expect(store().placing!.pin).not.toBeNull();
  });

  it('сдвиг плана снимает булавку; известный масштаб — только поворот, без растяжения', () => {
    store().startPlacing('building_a', VIEW);
    const { frame, planSize } = store().placing!;
    const pin = applySimilarity(frame, { x: 0, y: 0 });
    store().setPlacingPin(pin);
    store().setPlacingFrame(moveFrame(frame, 10, 0));
    expect(store().placing!.pin).toBeNull();

    const far = farCorner(frame, planSize, pin);
    const turned = turnAroundPin({ frame, at: far }, pin, { x: far.x + 40, y: far.y + 90 }, false);
    const reached = applySimilarity(turned, { x: planSize.width, y: planSize.height });
    expect(Math.hypot(reached.x - pin.x, reached.y - pin.y)).toBeCloseTo(Math.hypot(far.x - pin.x, far.y - pin.y), 6);
    expect(placingAllowsScale({ planMpp: 0.05, baseMpp: 0.5 })).toBe(false);
    expect(placingAllowsScale({ planMpp: null, baseMpp: 0.5 })).toBe(true);
  });

  it('«Применить» — одна правка, точки корпуса встают на территории туда, где их видно', () => {
    store().startPlacing('building_a', VIEW);
    const frame = { ...store().placing!.frame, tx: store().placing!.frame.tx + 20 };
    store().setPlacingFrame(frame);
    store().applyPlacing();

    expect(store().placing).toBeNull();
    expect(useHistoryStore.getState().entries).toHaveLength(1);
    expect(useHistoryStore.getState().entries[0].description).toBe('«Корпус А» перемещён на территории');
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

describe('совмещение этажа с этажом входа', () => {
  const world = (floor: number, x: number, y: number) => {
    const { campusMeta, buildingMetas } = store();
    return createCampusProjection(campusMeta!, buildingMetas.values()).toWorld({ building: 'building_a', floor, x, y })!;
  };

  it('открывается этаж входа, поверх — план этажа; без своей привязки — один в один', () => {
    expect(store().startPlacingFloor('building_a', 2)).toBeNull();
    expect([store().currentBuilding, store().currentFloor]).toEqual(['building_a', 1]);
    const { frame, mode, floor } = store().placing!;
    expect([mode, floor]).toEqual(['floor', 2]);
    expect(frame.a).toBeCloseTo(1, 9);
    expect(frame.b).toBeCloseTo(0, 9);
    expect(frame.tx).toBeCloseTo(0, 6);
  });

  it('этаж встаёт туда, где его показали поверх этажа входа', () => {
    store().startPlacingFloor('building_a', 2);
    // План второго этажа вдвое мельче и сдвинут относительно первого.
    const frame = { a: 0.5, b: 0, tx: 20, ty: 10 };
    store().setPlacingFrame(frame);
    store().applyPlacing();

    expect(useHistoryStore.getState().entries[0].description).toBe('Корпус А, этаж 2 совмещён с этажом входа');
    // Точка этажа 2 и то место этажа 1, куда она легла, — одно место территории.
    const upstairs = world(2, 100, 60);
    const below = world(1, 0.5 * 100 + 20, 0.5 * 60 + 10);
    expect(upstairs.x).toBeCloseTo(below.x, 6);
    expect(upstairs.y).toBeCloseTo(below.y, 6);
  });

  it('корпус передвинули — этаж со своей привязкой едет вместе с ним', () => {
    store().startPlacingFloor('building_a', 2);
    store().setPlacingFrame({ a: 0.5, b: 0, tx: 20, ty: 10 });
    store().applyPlacing();
    const before = { upstairs: world(2, 100, 60), below: world(1, 70, 40) };

    store().startPlacing('building_a', VIEW);
    const turned = { ...store().placing!.frame, tx: store().placing!.frame.tx + 50 };
    store().setPlacingFrame(turned);
    store().applyPlacing();

    const after = { upstairs: world(2, 100, 60), below: world(1, 70, 40) };
    expect(after.upstairs.x - after.below.x).toBeCloseTo(before.upstairs.x - before.below.x, 6);
    expect(after.upstairs.y - after.below.y).toBeCloseTo(before.upstairs.y - before.below.y, 6);
    expect(after.below.x).not.toBeCloseTo(before.below.x, 3);
  });

  it('«Как у корпуса» снимает свою привязку', () => {
    store().setFloorPlacement('building_a', 2, { metersPerPixel: 0.2, originMeters: { x: 1, y: 2 }, rotationDeg: 5 });
    store().setFloorPlacement('building_a', 2, null);
    expect(store().buildingMetas.get('building_a')!.floors[1].placement).toBeUndefined();
  });

  it('этаж входа и неподставленный корпус — с объяснением', () => {
    expect(store().startPlacingFloor('building_a', 1)).toMatch(/Этаж входа/);
    const dataset = fixtureDataset();
    delete dataset.buildingMetas[0].placement!.originMeters;
    loadFixture(dataset);
    expect(store().startPlacingFloor('building_a', 2)).toMatch(/Сначала поставьте корпус/);
  });

  it('другой этаж открыли — совмещение закончилось', () => {
    store().startPlacingFloor('building_a', 2);
    store().setCurrentFloor(2);
    expect(store().placing).toBeNull();
  });
});

describe('масштаб чертежа при постановке', () => {
  /** План этажа из PDF 1:200 — масштаб чертежа известен. */
  const scaledPlan = {
    key: 'sha1:' + '7'.repeat(40),
    format: 'png' as const,
    mapSize: { width: 4000, height: 2827 },
    source: { file: '0123456789abcdef.pdf', page: 1, pageSize: { width: 842, height: 595 }, metersPerUnit: (0.0254 / 72) * 200 },
  };
  const planMpp = (842 * (0.0254 / 72) * 200) / 4000;

  it('новый корпус с масштабом чертежа встаёт в своём размере', () => {
    store().addBuilding('Корпус Г');
    store().addFloor('building_g', { floor: 1, plan: scaledPlan });
    store().startPlacing('building_g', VIEW);
    const { frame, planMpp: known } = store().placing!;
    expect(known).toBeCloseTo(planMpp, 9);
    expect(Math.hypot(frame.a, frame.b)).toBeCloseTo(planMpp / 0.5, 9);
  });

  it('масштаб территории неизвестен — он находится по корпусу, одной правкой', () => {
    const dataset = fixtureDataset();
    delete dataset.campusMeta.metersPerPixel;
    loadFixture(dataset);
    store().addBuilding('Корпус Г');
    store().addFloor('building_g', { floor: 1, plan: scaledPlan });
    const entries = useHistoryStore.getState().entries.length;

    expect(store().startPlacing('building_g', VIEW)).toBeNull();
    expect(store().placing!.baseMpp).toBeNull();
    // Человек растянул план корпуса по очертаниям на плане территории.
    store().setPlacingFrame({ a: 0.1, b: 0, tx: 100, ty: 50 });
    store().applyPlacing();

    expect(store().campusMeta!.metersPerPixel).toBeCloseTo(planMpp / 0.1, 6);
    expect(store().buildingMetas.get('building_g')!.placement!.metersPerPixel).toBeCloseTo(planMpp, 6);
    expect(useHistoryStore.getState().entries.length).toBe(entries + 1);
    store().undo();
    expect(store().campusMeta!.metersPerPixel).toBeUndefined();
  });

  it('этаж с масштабом чертежа совмещается в масштабе этажа входа', () => {
    store().setPlan('building_a', 1, scaledPlan);
    store().setPlan('building_a', 2, { ...scaledPlan, mapSize: { width: 2000, height: 1414 } });
    store().startPlacingFloor('building_a', 2);
    // План второго этажа вдвое мельче в точках — его пиксель вдвое крупнее.
    expect(store().placing!.frame.a).toBeCloseTo(2, 9);
  });
});
