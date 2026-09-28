import { beforeEach, describe, expect, it } from 'vitest';
import { planTitle, suggestSidePlan } from '../src/stores/editor/windowSlice';
import { suggestTransitionPlan } from '../src/stores/editor/transitionPlan';
import type { PlanRef } from '../src/stores/editor/windowSlice';
import { loadFixture, openFloor, store } from './helpers/fixture';

/**
 * Окна карт (запись 66): вкладки открытых планов, как в браузере, и вторая
 * карта рядом. Открытый план активной вкладки — `currentBuilding` и
 * `currentFloor`; вкладка помнит свой план и выбор, пока она не на виду.
 */

beforeEach(() => loadFixture());

const A = (floor: number): PlanRef => ({ building: 'building_a', floor });
const TERRITORY: PlanRef = { building: null, floor: null };

/** Вкладки карты: названия, у показанной — звёздочка. */
function tabs(group = 0): string[] {
  const s = store();
  const map = s.mapGroups[group];
  return map.tabs.map((tab) => {
    const plan = group === s.activeGroup && tab.id === map.activeTab ? { building: s.currentBuilding, floor: s.currentFloor } : tab;
    return planTitle(s.buildingMetas, plan) + (tab.id === map.activeTab ? '*' : '');
  });
}

const open = () => ({ building: store().currentBuilding, floor: store().currentFloor });
const selection = () => [...store().selectedNodeIds].sort();

describe('вкладки', () => {
  it('план из дерева открывается новой вкладкой, открытый — переключением на него', () => {
    store().openPlan(A(1));
    store().openPlan(A(2));
    expect(tabs()).toEqual(['Территория', 'Корпус А · 1', 'Корпус А · 2*']);

    store().openPlan(A(1));
    expect(tabs()).toEqual(['Территория', 'Корпус А · 1*', 'Корпус А · 2']);
    expect(open()).toEqual(A(1));
  });

  it('новая вкладка встаёт справа от текущей', () => {
    store().openPlan(A(2));
    store().openPlan(TERRITORY);
    store().openPlan(A(1));
    expect(tabs()).toEqual(['Территория', 'Корпус А · 1*', 'Корпус А · 2']);
  });

  it('у каждой вкладки свой выбор', () => {
    store().openPlan(A(1));
    store().selectSingleNode('a1_hall');
    store().openPlan(A(2));
    expect(selection()).toEqual([]);
    store().selectSingleNode('a2_corridor');

    const first = store().mapGroups[0].tabs[1];
    store().activateTab(0, first.id);
    expect(selection()).toEqual(['a1_hall']);
    store().openPlan(A(2));
    expect(selection()).toEqual(['a2_corridor']);
  });

  it('удалённая точка из запомненного выбора не возвращается', () => {
    store().openPlan(A(1));
    store().selectSingleNode('a1_room101');
    store().openPlan(A(2));
    store().removeNode('a1_room101');
    store().openPlan(A(1));
    expect(selection()).toEqual([]);
  });

  it('строка пути меняет план текущей вкладки, а открытый в другой вкладке — открывает её', () => {
    store().openPlan(A(1));
    store().openPlan(A(2), 'here');
    expect(tabs()).toEqual(['Территория', 'Корпус А · 2*']);

    store().openPlan(TERRITORY, 'here');
    expect(tabs()).toEqual(['Территория*', 'Корпус А · 2']);
  });

  it('прежние действия — «перейти на этаж» — меняют план текущей вкладки', () => {
    store().openPlan(A(1));
    store().setCurrentFloor(2);
    expect(tabs()).toEqual(['Территория', 'Корпус А · 2*']);
  });

  it('закрыли показанную вкладку — открывается соседняя справа, у крайней — слева', () => {
    store().openPlan(A(1));
    store().openPlan(A(2));
    const [territory, first] = store().mapGroups[0].tabs;
    store().activateTab(0, first.id);
    store().closeTab(0, first.id);
    expect(tabs()).toEqual(['Территория', 'Корпус А · 2*']);
    expect(open()).toEqual(A(2));

    const last = store().mapGroups[0].tabs[1];
    store().closeTab(0, last.id);
    expect(tabs()).toEqual(['Территория*']);
    expect(open()).toEqual(TERRITORY);

    // Последняя вкладка единственной карты не закрывается.
    store().closeTab(0, territory.id);
    expect(tabs()).toEqual(['Территория*']);
  });

  it('закрыть другие вкладки', () => {
    store().openPlan(A(1));
    store().openPlan(A(2));
    const first = store().mapGroups[0].tabs[1];
    store().closeOtherTabs(0, first.id);
    expect(tabs()).toEqual(['Корпус А · 1*']);
  });

  it('вкладки переставляются перетаскиванием', () => {
    store().openPlan(A(1));
    store().openPlan(A(2));
    const [territory, , second] = store().mapGroups[0].tabs;
    store().moveTab(0, second.id, 0, territory.id);
    expect(tabs()).toEqual(['Корпус А · 2*', 'Территория', 'Корпус А · 1']);
    store().moveTab(0, second.id, 0, null);
    expect(tabs()).toEqual(['Территория', 'Корпус А · 1', 'Корпус А · 2*']);
  });

  it('новый этаж открывается своей вкладкой, а план, на котором работали, остаётся', () => {
    store().openPlan(A(1));
    store().addFloor('building_a', { floor: 3 });
    expect(tabs()).toEqual(['Территория', 'Корпус А · 1', 'Корпус А · 3*']);
  });

  it('вкладка удалённого этажа переходит на этаж входа, одинаковые вкладки сливаются', () => {
    store().openPlan(A(1));
    store().openPlan(A(2));
    store().openPlan(TERRITORY);
    store().deleteFloor('building_a', 2);
    expect(tabs()).toEqual(['Территория*', 'Корпус А · 1']);

    // Отмена возвращает этаж, но вкладку не открывает сама.
    store().undo();
    expect(store().buildingMetas.get('building_a')!.floors.map((f) => f.floor)).toEqual([1, 2]);
  });

  it('сменили номер этажа — вкладка идёт за ним', () => {
    store().openPlan(A(2));
    store().openPlan(TERRITORY);
    store().updateFloor('building_a', 2, { floor: 5 });
    expect(tabs()).toEqual(['Территория*', 'Корпус А · 5']);
  });

  it('удалили корпус — его вкладки уходят на территорию и сливаются с ней', () => {
    store().openPlan(A(1));
    store().openPlan(A(2));
    store().deleteBuilding('building_a');
    expect(tabs()).toEqual(['Территория*']);
  });

  it('постановка корпуса открывает территорию вкладкой; вернулись к этажу — постановка закончилась', () => {
    store().openPlan(A(1));
    expect(store().startPlacing('building_a', { center: { x: 400, y: 300 }, width: 800 })).toBeNull();
    expect(tabs()).toEqual(['Территория*', 'Корпус А · 1']);
    expect(store().placing).not.toBeNull();

    store().openPlan(A(1));
    expect(store().placing).toBeNull();
  });
});

describe('две карты рядом', () => {
  it('«Открыть рядом» предлагает соседний этаж, территорию или корпус', () => {
    const st = store();
    expect(suggestSidePlan(st, A(1))).toEqual(A(2));
    expect(suggestSidePlan(st, A(2))).toEqual(A(1));
    expect(suggestSidePlan(st, TERRITORY)).toEqual(A(1));
  });

  it('открывает вторую карту и переводит на неё работу', () => {
    store().openPlan(A(1));
    store().selectSingleNode('a1_hall');
    store().openSide();

    expect(store().mapGroups).toHaveLength(2);
    expect(store().activeGroup).toBe(1);
    expect(open()).toEqual(A(2));
    expect(tabs(1)).toEqual(['Корпус А · 2*']);
    expect(selection()).toEqual([]);

    store().focusGroup(0);
    expect(open()).toEqual(A(1));
    expect(selection()).toEqual(['a1_hall']);
  });

  it('начатый переход переживает переход на другую карту, а начатая связь — нет', () => {
    store().openPlan(A(1));
    store().openSide();
    store().focusGroup(0);
    store().setTransitionStartNode('a1_stairs');
    store().setEdgeStartNode('a1_hall');
    store().focusGroup(1);
    expect(store().transitionStartNodeId).toBe('a1_stairs');
    expect(store().edgeStartNodeId).toBeNull();
  });

  it('«показать точку» с плана соседней карты переходит туда, а не открывает вкладку', () => {
    store().openPlan(A(1));
    store().openSide();
    store().focusGroup(0);
    store().navigateToNode('a2_room201');
    expect(store().activeGroup).toBe(1);
    expect(tabs(0)).toEqual(['Территория', 'Корпус А · 1*']);
  });

  it('свернуть вторую карту — работа на первой; развернуть — на второй', () => {
    store().openPlan(A(1));
    store().openSide();
    store().setSideCollapsed(true);
    expect(store().activeGroup).toBe(0);
    expect(open()).toEqual(A(1));
    expect(store().mapGroups).toHaveLength(2);

    store().setSideCollapsed(false);
    expect(store().activeGroup).toBe(1);
    expect(open()).toEqual(A(2));
  });

  it('закрыли вторую карту — первая с её планом и выбором', () => {
    store().openPlan(A(1));
    store().selectSingleNode('a1_hall');
    store().openSide();
    store().closeSide();
    expect(store().mapGroups).toHaveLength(1);
    expect(store().activeGroup).toBe(0);
    expect(open()).toEqual(A(1));
    expect(selection()).toEqual(['a1_hall']);
  });

  it('последняя вкладка второй карты закрывает её', () => {
    store().openPlan(A(1));
    store().openSide();
    const only = store().mapGroups[1].tabs[0];
    store().closeTab(1, only.id);
    expect(store().mapGroups).toHaveLength(1);
    expect(open()).toEqual(A(1));
  });

  it('вкладку переносят на вторую карту и обратно', () => {
    store().openPlan(A(1));
    store().openPlan(A(2));
    const second = store().mapGroups[0].tabs[2];
    store().moveTab(0, second.id, 1);
    expect(tabs(0)).toEqual(['Территория', 'Корпус А · 1*']);
    expect(tabs(1)).toEqual(['Корпус А · 2*']);
    expect(store().activeGroup).toBe(1);

    store().moveTab(1, second.id, 0, null);
    expect(store().mapGroups).toHaveLength(1);
    expect(tabs(0)).toEqual(['Территория', 'Корпус А · 1', 'Корпус А · 2*']);
  });

  it('единственную вкладку единственной карты рядом не открыть — вторая карта была бы пустой', () => {
    const only = store().mapGroups[0].tabs[0];
    store().moveTab(0, only.id, 1);
    expect(store().mapGroups).toHaveLength(1);
  });

  it('доля карт ограничена', () => {
    store().setSplitRatio(0.05, false);
    expect(store().splitRatio).toBe(0.2);
    store().setSplitRatio(0.95, false);
    expect(store().splitRatio).toBe(0.8);
  });

  it('прямая запись открытого плана (как в старых тестах) догоняется вкладкой', () => {
    openFloor(2);
    expect(tabs()).toEqual(['Корпус А · 2*']);
  });
});

describe('переход с двух карт', () => {
  it('подсказывает план второго конца по типу перехода', () => {
    const st = store();
    expect(suggestTransitionPlan(st, 'a1_entrance', 'entrance')).toEqual(TERRITORY);
    expect(suggestTransitionPlan(st, 'campus_gate', 'entrance')).toEqual(A(1));
    expect(suggestTransitionPlan(st, 'a1_hall', 'stairs')).toEqual(A(2));
    expect(suggestTransitionPlan(st, 'a2_room201', 'lift')).toEqual(A(1));
    expect(suggestTransitionPlan(st, 'campus_gate', 'stairs')).toBeNull();
    // Другого корпуса нет — переходу между корпусами подсказать нечего.
    expect(suggestTransitionPlan(st, 'a1_hall', 'bridge')).toBeNull();
  });

  it('лестница ведёт на соседний этаж, ещё не связанный с точкой: сначала выше', () => {
    store().addFloor('building_a', { floor: 3 });
    // a2_stairs уже связана с этажом 1 — подсказка идёт выше.
    expect(suggestTransitionPlan(store(), 'a2_stairs', 'stairs')).toEqual(A(3));
    expect(suggestTransitionPlan(store(), 'a2_room201', 'stairs')).toEqual(A(3));

    // Этаж выше уже связан — подсказка идёт ниже.
    openFloor(3);
    const upper = store().addNode(100, 100);
    expect(store().addTransition('a2_corridor', upper, 'stairs')).toBe('created');
    expect(suggestTransitionPlan(store(), 'a2_corridor', 'stairs')).toEqual(A(1));
  });

  it('«Переход отсюда» открывает второй конец на соседней карте, работа остаётся на первой', () => {
    store().openPlan(A(1));
    store().startTransitionFrom('a1_hall', 'stairs');
    expect(store().activeTool).toBe('transition');
    expect(store().transitionType).toBe('stairs');
    expect(store().transitionStartNodeId).toBe('a1_hall');
    expect(store().activeGroup).toBe(0);
    expect(tabs(1)).toEqual(['Корпус А · 2*']);
    expect(store().notice?.text).toMatch(/соседней карте — там «Корпус А · 2»/);

    // Вторая точка — щелчком на соседней карте: она становится активной, начало перехода живо.
    store().focusGroup(1);
    expect(store().addTransition('a1_hall', 'a2_corridor', 'stairs')).toBe('created');
  });

  it('соседняя карта с нужным планом не получает лишней вкладки; с другим — получает вкладку', () => {
    store().openPlan(A(1));
    store().openSide();
    store().focusGroup(0);
    store().startTransitionFrom('a1_hall', 'stairs');
    expect(tabs(1)).toEqual(['Корпус А · 2*']);

    store().startTransitionFrom('a1_entrance', 'entrance');
    expect(tabs(1)).toEqual(['Корпус А · 2', 'Территория*']);
    expect(store().activeGroup).toBe(0);
  });
});
