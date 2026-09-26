import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from '../src/stores/editorStore';
import { useHistoryStore } from '../src/stores/historyStore';
import {
  buildingIdFor,
  buildingNameProblem,
  floorLabelProblem,
  floorNumberProblem,
  transliterate,
} from '../src/stores/editor/structureSlice';
import { datasetFromState } from '../src/stores/editor/graphState';
import { datasetFiles } from '../src/utils/datasetFiles';
import { dataSnapshot, fixtureDataset, loadFixture, openFloor, store } from './helpers/fixture';

/**
 * Корпуса, этажи и планы (запись 47): каждое действие отменяется целиком и
 * повторяется ровно, а удаление этажа или корпуса возвращает отменой всё —
 * точки, названия, переходы, план.
 */

beforeEach(() => loadFixture());

/** Всё, что меняет правка структуры: данные, корпуса, планы, открытый план. */
function fullSnapshot() {
  const s = store();
  return {
    data: dataSnapshot(),
    buildings: JSON.stringify([...s.buildingMetas.values()]),
    campus: JSON.stringify(s.campusMeta),
    planFiles: [...s.planFiles.entries()].sort(([a], [b]) => a.localeCompare(b)),
  };
}

const view = () => ({ building: store().currentBuilding, floor: store().currentFloor });

const PLAN = { key: 'sha1:0123456789abcdef0123456789abcdef01234567', format: 'webp' as const, mapSize: { width: 800, height: 400 } };

const cases: { name: string; setup?: () => void; act: () => void }[] = [
  { name: 'добавить корпус', act: () => store().addBuilding('Корпус Г') },
  { name: 'переименовать корпус', act: () => store().updateBuilding('building_a', { name: 'Главный корпус', nameEn: 'Main' }) },
  { name: 'сменить этаж входа', act: () => store().updateBuilding('building_a', { entranceFloor: 2 }) },
  { name: 'удалить корпус', setup: () => openFloor(1), act: () => store().deleteBuilding('building_a') },
  { name: 'добавить этаж с планом', act: () => store().addFloor('building_a', { floor: 3, label: '3', plan: PLAN }) },
  { name: 'добавить подвал без плана', act: () => store().addFloor('building_a', { floor: -1 }) },
  { name: 'подписать этаж', act: () => store().updateFloor('building_a', 1, { label: '1А' }) },
  { name: 'сменить номер этажа', setup: () => openFloor(2), act: () => store().updateFloor('building_a', 2, { floor: 3 }) },
  { name: 'удалить этаж', setup: () => openFloor(2), act: () => store().deleteFloor('building_a', 2) },
  { name: 'новый план этажа', act: () => store().setPlan('building_a', 1, PLAN) },
  {
    name: 'новый план со сдвигом точек',
    act: () => store().setPlan('building_a', 1, { ...PLAN, moveNodes: { a: 2, b: 0, tx: 10, ty: -5 } }),
  },
  { name: 'новый план территории', act: () => store().setPlan(null, null, PLAN) },
];

describe('отмена и повтор правок структуры', () => {
  for (const c of cases) {
    it(c.name, () => {
      c.setup?.();
      const before = fullSnapshot();
      const viewBefore = view();

      c.act();
      const after = fullSnapshot();
      const viewAfter = view();
      expect(after).not.toEqual(before);
      expect(useHistoryStore.getState().entries).toHaveLength(1);

      store().undo();
      expect(fullSnapshot()).toEqual(before);
      expect(view()).toEqual(viewBefore);

      store().redo();
      expect(fullSnapshot()).toEqual(after);
      expect(view()).toEqual(viewAfter);
    });
  }
});

describe('удаление', () => {
  it('этаж уносит точки, их названия и переходы на другие этажи', () => {
    store().deleteFloor('building_a', 2);
    const s = store();
    expect([...s.nodes.keys()].filter((id) => id.startsWith('a2_'))).toEqual([]);
    expect(s.aliases.has('a2_room201')).toBe(false);
    expect(s.transitions.some((t) => t.toNode === 'a2_stairs')).toBe(false);
    // Лестница первого этажа больше никуда не ведёт — отметка перехода снята.
    expect(s.nodes.get('a1_stairs')?.isPortal).toBe(false);
    expect(s.planFiles.has('building_a/2')).toBe(false);
  });

  it('связи других планов на удалённые точки убираются, отмена их возвращает', () => {
    // Связь сквозь перекрытие — ошибка разметки, но в данных она бывает, и
    // висячая ссылка на удалённую точку сломала бы маршрут.
    const dataset = fixtureDataset();
    dataset.nodes.find((node) => node.id === 'a1_hall')!.neighbors.push('a2_corridor');
    dataset.nodes.find((node) => node.id === 'a2_corridor')!.neighbors.push('a1_hall');
    loadFixture(dataset);

    store().deleteFloor('building_a', 2);
    expect(store().nodes.get('a1_hall')?.neighbors).toEqual(['a1_entrance', 'a1_stairs', 'a1_room101']);
    store().undo();
    expect(store().nodes.get('a1_hall')?.neighbors).toEqual(['a1_entrance', 'a1_stairs', 'a1_room101', 'a2_corridor']);
  });

  it('открытый удалённый этаж сменяется этажом входа', () => {
    openFloor(2);
    store().deleteFloor('building_a', 2);
    expect(view()).toEqual({ building: 'building_a', floor: 1 });
  });

  it('удалённый корпус уходит из файлов данных и списка корпусов', () => {
    openFloor(1);
    store().deleteBuilding('building_a');
    expect(view()).toEqual({ building: null, floor: null });
    const files = datasetFiles(datasetFromState(store()));
    expect([...files.keys()].some((path) => path.startsWith('buildings/building_a/'))).toBe(false);
    expect(JSON.parse(files.get('campus/meta.json')!).buildings).toEqual([]);
    // Вход на территории вёл в корпус — перехода больше нет.
    expect(store().transitions).toEqual([]);
  });

  it('предупреждение перечисляет, что уйдёт', () => {
    expect(store().deletionImpact('building_a', 2)).toEqual({ floors: 1, nodes: 3, named: 1, crossings: 1, plans: 1 });
    expect(store().deletionImpact('building_a')).toEqual({ floors: 2, nodes: 7, named: 2, crossings: 1, plans: 2 });
  });
});

describe('номер этажа', () => {
  it('точки, план и этаж входа переезжают вместе с номером', () => {
    const planKey = store().planFiles.get('building_a/1');
    store().updateFloor('building_a', 1, { floor: 0 });
    const s = store();
    expect(s.nodes.get('a1_hall')?.floor).toBe(0);
    expect(s.planFiles.get('building_a/0')).toBe(planKey);
    expect(s.planFiles.has('building_a/1')).toBe(false);
    expect(s.buildingMetas.get('building_a')?.entranceFloor).toBe(0);
    expect(s.buildingMetas.get('building_a')?.floors.map((floor) => floor.floor)).toEqual([0, 2]);
  });

  it('занятый номер отклоняется без записи в историю', () => {
    expect(store().updateFloor('building_a', 1, { floor: 2 })).toMatch(/уже есть/);
    expect(store().addFloor('building_a', { floor: 1 })).toMatch(/уже есть/);
    expect(useHistoryStore.getState().entries).toEqual([]);
  });
});

describe('новый корпус', () => {
  it('получает код по букве, английское имя и открывается без этажей', () => {
    const result = store().addBuilding('  Корпус Г ');
    expect(result).toEqual({ id: 'building_g' });
    const meta = store().buildingMetas.get('building_g');
    expect(meta).toMatchObject({ name: 'Корпус Г', floors: [], translations: { en: { name: 'Building G' } } });
    expect(view()).toEqual({ building: 'building_g', floor: null });
  });

  it('то же имя — отказ', () => {
    expect(store().addBuilding('корпус а')).toEqual({ problem: 'Корпус «Корпус А» уже есть' });
  });

  it('первый этаж нового корпуса открывается сразу', () => {
    store().addBuilding('Корпус Г');
    store().addFloor('building_g', { floor: 1, plan: PLAN });
    expect(view()).toEqual({ building: 'building_g', floor: 1 });
    expect(store().buildingMetas.get('building_g')?.floors[0]).toMatchObject({ floor: 1, planFormat: 'webp', mapSize: PLAN.mapSize });
  });
});

describe('новый план сдвигает точки', () => {
  it('по переданному подобию', () => {
    store().setPlan('building_a', 1, { ...PLAN, moveNodes: { a: 2, b: 0, tx: 10, ty: -5 } });
    expect(store().nodes.get('a1_hall')).toMatchObject({ x: 210, y: 235 });
    // Точки другого этажа на месте.
    expect(store().nodes.get('a2_corridor')).toMatchObject({ x: 200, y: 120 });
  });
});

describe('проверки ввода', () => {
  it('код корпуса — латиница по букве, свободный', () => {
    expect(transliterate('Корпус Щ')).toBe('korpus sch');
    expect(buildingIdFor('Корпус Б', () => false)).toBe('building_b');
    expect(buildingIdFor('Корпус Б', (id) => id === 'building_b')).toBe('building_b_2');
    expect(buildingIdFor('Спорткомплекс', () => false)).toBe('building_sportkompleks');
    expect(buildingIdFor('###', () => false)).toBe('building_new');
  });

  it('имя, номер, подпись', () => {
    const metas = store().buildingMetas;
    expect(buildingNameProblem('  ', metas)).toMatch(/пустым/);
    expect(buildingNameProblem('Корпус А', metas, 'building_a')).toBeNull();
    expect(floorNumberProblem(Number.NaN, metas.get('building_a'))).toMatch(/число/);
    expect(floorNumberProblem(1.5, metas.get('building_a'))).toBeNull();
    expect(floorNumberProblem(2, metas.get('building_a'), 2)).toBeNull();
    expect(floorLabelProblem('Антресольный этаж')).toMatch(/не длиннее/);
  });
});

describe('правка панели', () => {
  it('несколько правок корпуса в панели — одна запись истории', () => {
    store().runInSession('building:building_a', 'Изменён корпус', () => store().updateBuilding('building_a', { name: 'А1' }));
    store().runInSession('building:building_a', 'Изменён корпус', () => store().updateBuilding('building_a', { name: 'А2' }));
    store().closeSession();
    expect(useHistoryStore.getState().entries).toHaveLength(1);
    store().undo();
    expect(store().buildingMetas.get('building_a')?.name).toBe('Корпус А');
  });

  it('вернули как было — записи нет', () => {
    store().runInSession('building:building_a', 'Изменён корпус', () => {
      store().updateBuilding('building_a', { name: 'А1' });
      store().updateBuilding('building_a', { name: 'Корпус А' });
    });
    store().closeSession();
    expect(useHistoryStore.getState().entries).toEqual([]);
  });
});

it('стор помнит планы данных при открытии', () => {
  expect([...useEditorStore.getState().planFiles.entries()]).toEqual([
    ['campus', 'data:campus/map.svg'],
    ['building_a/1', 'data:buildings/building_a/floors/1/map.svg'],
    ['building_a/2', 'data:buildings/building_a/floors/2/map.svg'],
  ]);
});
