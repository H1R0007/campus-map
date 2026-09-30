import { beforeEach, describe, expect, it } from 'vitest';
import { structureChecks } from '../src/utils/structureChecks';
import { fixtureDataset, loadFixture, store } from './helpers/fixture';

/**
 * Проверка структуры (запись 51): чего не хватит навигатору, — с действием,
 * которое это исправляет.
 */

beforeEach(() => loadFixture());

const checks = () => structureChecks(store());

describe('проверка структуры', () => {
  it('полные данные — находок нет', () => {
    expect(checks()).toEqual([]);
  });

  it('масштаб территории не задан — предлагается замер', () => {
    const dataset = fixtureDataset();
    delete dataset.campusMeta.metersPerPixel;
    loadFixture(dataset);
    expect(checks()).toEqual([expect.objectContaining({ action: { kind: 'measure' }, navigator: true })]);
  });

  it('новый корпус: без этажей, затем этаж без плана и без места на территории', () => {
    store().addBuilding('Корпус Г');
    expect(checks().map((issue) => issue.action)).toEqual([{ kind: 'open', building: 'building_g', floor: null }]);

    store().addFloor('building_g', { floor: 1 });
    const issues = checks();
    expect(issues.map((issue) => issue.action)).toEqual([
      { kind: 'place', building: 'building_g' },
      { kind: 'plan', building: 'building_g', floor: 1 },
    ]);
    expect(issues[0].text).toMatch(/не показывает время в пути во всём кампусе/);
    expect(issues.every((issue) => issue.navigator)).toBe(true);
  });

  it('поставленный корпус без высот этажей — открыть корпус, а не ставить заново', () => {
    const dataset = fixtureDataset();
    delete dataset.buildingMetas[0].placement!.floorHeightMeters;
    loadFixture(dataset);
    expect(checks()).toEqual([
      expect.objectContaining({ action: { kind: 'open', building: 'building_a', floor: null }, text: expect.stringMatching(/высоты этажей/) }),
    ]);
  });

  it('точки за краем плана — совместить, навигатор это не спрашивает', () => {
    store().setPlan('building_a', 2, { key: 'sha1:' + '5'.repeat(40), format: 'png', mapSize: { width: 100, height: 50 } });
    expect(checks()).toEqual([
      {
        text: 'На этаже 2 корпуса «Корпус А» 3 точки за краем плана — похоже, план заменили, а точки не совместили',
        action: { kind: 'align', building: 'building_a', floor: 2 },
        actionLabel: 'Совместить…',
        navigator: false,
      },
    ]);
  });

  it('точка на самой кромке плана — не находка', () => {
    store().updateNode('a1_hall', { x: 404, y: -3 });
    expect(checks()).toEqual([]);
  });
});
