import { beforeEach, describe, expect, it } from 'vitest';
import { readiness } from '../src/utils/readiness';
import type { FloorMatch, ReadinessInput } from '../src/utils/readiness';
import { fixtureDataset, loadFixture, openFloor, store } from './helpers/fixture';

/**
 * «Готовность карты» (запись 67): каждая строка — проверка по данным с
 * кнопкой туда, где её исправляют.
 */

beforeEach(() => loadFixture());

function check(overrides: Partial<ReadinessInput> = {}) {
  const s = store();
  return readiness({
    campusMeta: s.campusMeta,
    buildingMetas: s.buildingMetas,
    planFiles: s.planFiles,
    nodes: s.nodes,
    transitions: s.transitions,
    aliases: s.aliases,
    errors: 0,
    unsaved: false,
    checkedRoutes: [],
    floorMatches: new Map(),
    ...overrides,
  });
}

const item = (result: ReturnType<typeof check>, id: string) => {
  const found = result.items.find((entry) => entry.id === id);
  if (!found) throw new Error(`нет строки ${id}`);
  return found;
};

const notDone = (result: ReturnType<typeof check>) => result.items.filter((entry) => entry.state !== 'done').map((entry) => entry.id);

describe('готовность карты', () => {
  it('полная разметка: не хватает только проверки маршрутов', () => {
    const result = check();
    expect(result.total).toBe(15);
    expect(result.done).toBe(14);
    expect(notDone(result)).toEqual(['routeChecked']);
    expect(result.next?.id).toBe('routeChecked');
    expect(result.next?.button?.action).toEqual({ kind: 'route' });
  });

  it('два проложенных маршрута — всё готово; маршрут к удалённой точке не считается', () => {
    expect(check({ checkedRoutes: ['campus_gate→a2_room201', 'a1_room101→a2_room201'] }).next).toBeNull();
    expect(item(check({ checkedRoutes: ['campus_gate→a2_room201', 'a1_room101→gone'] }), 'routeChecked').state).toBe('todo');
  });

  it('масштаба нет: замер — первое дело, размещение ждёт его', () => {
    const dataset = fixtureDataset();
    delete dataset.campusMeta.metersPerPixel;
    loadFixture(dataset);
    const result = check();
    expect(item(result, 'territoryScale')).toMatchObject({ state: 'todo', button: { action: { kind: 'measure' } } });
    expect(item(result, 'placed')).toMatchObject({ state: 'blocked', status: 'Сначала масштаб территории' });
    expect(result.next?.id).toBe('territoryScale');
  });

  it('новый корпус: этажи, план, место на территории, точки и вход', () => {
    store().addBuilding('Корпус Г');
    expect(item(check(), 'floorPlans').problems).toEqual([
      { text: 'Корпус Г: этажей нет', button: { label: 'Добавить этажи…', action: { kind: 'open', building: 'building_g', floor: null } } },
    ]);

    store().addFloor('building_g', { floor: 1 });
    const result = check();
    expect(item(result, 'floorPlans').button?.action).toEqual({ kind: 'plan', building: 'building_g', floor: 1 });
    expect(item(result, 'placed').button?.action).toEqual({ kind: 'place', building: 'building_g' });
    expect(item(result, 'points').problems.map((problem) => problem.text)).toEqual(['Корпус Г, этаж 1: точек нет']);
    expect(item(result, 'entrances').button?.action).toEqual({ kind: 'entrance', building: 'building_g' });
    expect(notDone(result)).toEqual(['floorPlans', 'placed', 'heights', 'points', 'entrances', 'routeChecked']);
  });

  it('высоты этажей не заданы — открыть корпус', () => {
    const dataset = fixtureDataset();
    delete dataset.buildingMetas[0].placement!.floorHeightMeters;
    loadFixture(dataset);
    expect(item(check(), 'heights')).toMatchObject({ state: 'todo', button: { action: { kind: 'open', building: 'building_a', floor: 1 } } });
    expect(item(check(), 'placed').state).toBe('done');
  });

  it('одиночная точка — и в сети плана, и в сети карты; «Показать» выбирает её', () => {
    openFloor(1);
    const lonely = store().addNode(350, 60);
    const result = check();
    expect(item(result, 'onePlanNetwork').problems).toEqual([
      {
        text: 'Корпус А, этаж 1: 1 точка отдельно от остальных',
        button: { label: 'Показать', action: { kind: 'show', building: 'building_a', floor: 1, nodeIds: [lonely] } },
      },
    ]);
    expect(item(result, 'reachable').state).toBe('todo');
    // Без связей — не тупик: в «Помещения названы» её нет.
    expect(item(result, 'roomsNamed').state).toBe('done');
  });

  it('крыло с собственной лестницей — не оторванный кусок', () => {
    openFloor(2);
    const wing = store().addNode(40, 40);
    const room = store().addNode(40, 80);
    store().addEdge(wing, room);
    store().addTransition(wing, 'a1_hall', 'stairs');
    const result = check();
    expect(item(result, 'onePlanNetwork').state).toBe('done');
    expect(item(result, 'reachable').state).toBe('done');
  });

  it('безымянная тупиковая точка — желательно назвать', () => {
    openFloor(1);
    const door = store().addNode(200, 60);
    store().addEdge(door, 'a1_hall');
    const rooms = item(check(), 'roomsNamed');
    expect(rooms).toMatchObject({ state: 'todo', required: false, status: 'Без названия: 1' });
    expect(rooms.button?.action).toEqual({ kind: 'show', building: 'building_a', floor: 1, nodeIds: [door] });
  });

  it('без лестницы этаж отрезан от этажа входа', () => {
    store().removeTransition('a1_stairs', 'a2_stairs');
    const result = check();
    expect(item(result, 'floorsLinked').problems).toEqual([
      {
        text: 'Корпус А, этаж 2: не связан с этажом входа',
        button: { label: 'Добавить лестницу…', action: { kind: 'stairs', building: 'building_a', floor: 2 } },
      },
    ]);
    expect(item(result, 'reachable').problems.map((problem) => problem.text)).toEqual([
      'Корпус А, этаж 2: 3 точки не связаны с остальной картой',
    ]);
  });

  it('без входа корпус не соединён с территорией', () => {
    store().removeTransition('campus_entrance_a', 'a1_entrance');
    expect(item(check(), 'entrances')).toMatchObject({ state: 'todo', status: 'Без входа: Корпус А' });
  });

  it('этаж, сдвинутый относительно этажа входа, — совместить; пока считается — «проверяется»', () => {
    const shifted = new Map<string, FloorMatch>([['building_a|2', { overlap: 0.6, areaRatio: 1 }]]);
    expect(item(check({ floorMatches: shifted }), 'floorsMatch')).toMatchObject({
      state: 'todo',
      problems: [
        {
          text: 'Корпус А, этаж 2: совпадает с этажом входа на 60%',
          button: { label: 'Совместить…', action: { kind: 'placeFloor', building: 'building_a', floor: 2 } },
        },
      ],
    });
    expect(item(check({ floorMatches: new Map([['building_a|2', 'pending']]) }), 'floorsMatch').state).toBe('pending');
    expect(item(check({ floorMatches: new Map([['building_a|2', { overlap: 0.97, areaRatio: 1.1 }]]) }), 'floorsMatch')).toMatchObject({
      state: 'done',
      status: 'Совпадают: 1 этаж',
    });
    expect(item(check({ floorMatches: new Map([['building_a|2', { overlap: 1, areaRatio: 3 }]]) }), 'floorsMatch').problems[0].text).toMatch(
      /размер отличается от этажа входа в 3 раза/
    );
    expect(item(check({ floorMatches: new Map([['building_a|2', 'failed']]) }), 'floorsMatch')).toMatchObject({
      state: 'blocked',
      status: 'Планы этажей не прочитались — сравнить не удалось',
    });
  });

  it('дальше — обязательное, даже если желательное стоит в списке раньше', () => {
    const shifted = new Map<string, FloorMatch>([['building_a|2', { overlap: 0.6, areaRatio: 1 }]]);
    expect(check({ floorMatches: shifted, unsaved: true }).next?.id).toBe('saved');
    expect(check({ floorMatches: shifted }).next?.id).toBe('floorsMatch');
  });

  it('ошибки в данных и несохранённые правки', () => {
    const result = check({ errors: 2, unsaved: true });
    expect(item(result, 'noErrors')).toMatchObject({ state: 'todo', status: 'Ошибок: 2', button: { action: { kind: 'problems' } } });
    expect(item(result, 'saved')).toMatchObject({ state: 'todo', button: { action: { kind: 'save' } } });
    expect(result.next?.id).toBe('noErrors');
  });

  it('пустой кампус: сначала загрузить планы, остальное ждёт', () => {
    const empty = fixtureDataset();
    loadFixture({ ...empty, campusMeta: { ...empty.campusMeta, buildings: [] }, buildingMetas: [], nodes: [], transitions: [], aliases: [] });
    const result = check();
    expect(item(result, 'floorPlans')).toMatchObject({ state: 'todo', button: { action: { kind: 'import' } } });
    expect(['placed', 'points', 'onePlanNetwork', 'entrances', 'reachable'].map((id) => item(result, id).state)).toEqual([
      'blocked',
      'blocked',
      'blocked',
      'blocked',
      'blocked',
    ]);
  });
});
