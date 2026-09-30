import type { Draft } from 'immer';
import { CAMPUS_BUILDING_ID, floorLabel } from '@campus-map/core';
import type { BuildingMeta, MapNode, TransitionType } from '@campus-map/core';
import { TRANSITION_LABELS, nodeTitle } from '../../utils/labels';
import { suggestTransitionPlan } from './transitionPlan';
import { readLayoutPrefs, updateLayoutPrefs } from '../../utils/layoutPrefs';
import { openingFloorOf } from './viewSlice';
import type { EditorSlice, EditorStore } from './types';

/** План на карте: корпус и этаж; `building: null` — территория. */
export interface PlanRef {
  building: string | null;
  floor: number | null;
}

/** Вкладка карты — один открытый план, как вкладка браузера (запись 66). */
export interface MapTab extends PlanRef {
  id: string;
  /** Выбранные точки, пока вкладка не на виду: вернулись — выбор на месте. */
  selection: string[];
}

/** Карта со своими вкладками. Карт одна или две — рядом. */
export interface MapGroup {
  id: string;
  tabs: MapTab[];
  activeTab: string;
}

/**
 * Как открыть план:
 * - `here` — на месте текущей вкладки, как адрес в строке браузера; так
 *   открывают план дерево, строка пути и «Показать». Уже открытый в другой
 *   вкладке план не дублируется — открывается та вкладка;
 * - `tab` — новой вкладкой, только когда человек просит сам: Ctrl+щелчок,
 *   средняя кнопка, «Открыть в новой вкладке»;
 * - `side` — на соседней карте: «Открыть рядом» и переход с двух карт.
 */
export type OpenHow = 'tab' | 'here' | 'side';

/** Самая узкая и самая широкая доля левой карты, когда карты рядом. */
export const SPLIT_LIMITS = { min: 0.2, max: 0.8, initial: 0.5 } as const;

/**
 * Окна карт (запись 66): вкладки открытых планов и вторая карта рядом.
 *
 * Открытый план активной вкладки активной карты — это `currentBuilding` и
 * `currentFloor` (`viewSlice`): их читают правка, проверки и инспектор, и
 * всё прежнее работает с активной картой без переделки. Остальные вкладки
 * помнят свой план сами; вкладка, уходя с виду, запоминает и выбор.
 */
export interface WindowSlice {
  mapGroups: MapGroup[];
  /** Индекс карты, которая получает щелчки, клавиши и команды. */
  activeGroup: number;
  /** Вторая карта свёрнута в полоску сбоку — открыта, но не мешает. */
  sideCollapsed: boolean;
  /** Доля ширины левой карты, когда карты рядом. */
  splitRatio: number;

  openPlan: (plan: PlanRef, how?: OpenHow, options?: { focus?: boolean }) => void;
  activateTab: (group: number, tabId: string) => void;
  closeTab: (group: number, tabId: string) => void;
  closeOtherTabs: (group: number, tabId: string) => void;
  /** Переносит вкладку: в другую карту или на другое место в своей; `beforeTab` — перед какой вкладкой. */
  moveTab: (from: number, tabId: string, to: number, beforeTab?: string | null) => void;
  focusGroup: (group: number) => void;
  /** «Открыть рядом»: вторая карта с подходящим планом (`suggestSidePlan`). */
  openSide: (plan?: PlanRef) => void;
  closeSide: () => void;
  setSideCollapsed: (collapsed: boolean) => void;
  setSplitRatio: (ratio: number, remember?: boolean) => void;
  /**
   * Начать переход от точки: инструмент «Переход» с первой точкой, а на
   * соседней карте — план, где обычно второй конец (`suggestTransitionPlan`).
   * `type` — тип перехода; без него — выбранный в инструменте.
   */
  startTransitionFrom: (nodeId: string, type?: TransitionType) => void;
}

type State = Draft<EditorStore>;
/** Состояние для чтения: и черновик immer, и обычный снимок стора. */
type WindowsView = Pick<EditorStore, 'mapGroups' | 'activeGroup' | 'currentBuilding' | 'currentFloor' | 'buildingMetas'>;

let lastId = 0;
const nextId = (prefix: string): string => `${prefix}${++lastId}`;

const newTab = (plan: PlanRef): MapTab => ({ id: nextId('tab'), building: plan.building, floor: plan.floor, selection: [] });

export const samePlan = (a: PlanRef, b: PlanRef): boolean => a.building === b.building && a.floor === b.floor;

/** План, на котором стоит точка. */
export const planOfNode = (node: MapNode): PlanRef =>
  node.building === CAMPUS_BUILDING_ID ? { building: null, floor: null } : { building: node.building, floor: node.floor };

export function activeTabOf(group: MapGroup): MapTab {
  return group.tabs.find((tab) => tab.id === group.activeTab) ?? group.tabs[0];
}

/** План, который показывает карта `group`: у активной — открытый план стора. */
export function planOfGroup(st: WindowsView, group: number): PlanRef {
  if (group === st.activeGroup) return { building: st.currentBuilding, floor: st.currentFloor };
  const tab = activeTabOf(st.mapGroups[group]);
  return { building: tab.building, floor: tab.floor };
}

/** План вкладки: у активной вкладки активной карты — открытый план стора. */
export function planOfTab(st: WindowsView, group: number, tab: MapTab): PlanRef {
  return group === st.activeGroup && st.mapGroups[group]?.activeTab === tab.id
    ? { building: st.currentBuilding, floor: st.currentFloor }
    : { building: tab.building, floor: tab.floor };
}

/**
 * План, который есть в данных: у удалённого корпуса — территория, у
 * удалённого этажа — этаж входа, у корпуса без этажей — сам корпус без этажа.
 */
export function existingPlan(metas: ReadonlyMap<string, BuildingMeta>, plan: PlanRef): PlanRef {
  if (plan.building === null) return { building: null, floor: null };
  const meta = metas.get(plan.building);
  if (!meta) return { building: null, floor: null };
  if (plan.floor !== null && meta.floors.some((item) => item.floor === plan.floor)) return plan;
  return { building: plan.building, floor: openingFloorOf(meta) };
}

/** Название вкладки: «Территория», «Корпус А · 2», у корпуса без этажей — «Корпус А». */
export function planTitle(metas: ReadonlyMap<string, BuildingMeta>, plan: PlanRef): string {
  if (plan.building === null) return 'Территория';
  const meta = metas.get(plan.building);
  const name = meta?.name ?? plan.building;
  return plan.floor === null ? name : `${name} · ${floorLabel(meta, plan.floor)}`;
}

/**
 * Что открыть на соседней карте (запись 66): у этажа — этаж выше, у верхнего —
 * ниже, у единственного — территорию; у территории — этаж входа корпуса,
 * последнего открытого во вкладках, или первого по списку.
 */
export function suggestSidePlan(st: WindowsView, from: PlanRef): PlanRef {
  const territory: PlanRef = { building: null, floor: null };
  if (from.building !== null) {
    const meta = st.buildingMetas.get(from.building);
    const floors = (meta?.floors ?? []).map((item) => item.floor).sort((a, b) => a - b);
    const index = from.floor === null ? -1 : floors.indexOf(from.floor);
    const next = index < 0 ? undefined : (floors[index + 1] ?? floors[index - 1]);
    return next === undefined ? territory : { building: from.building, floor: next };
  }

  const opened = st.mapGroups
    .flatMap((group) => group.tabs)
    .map((tab) => tab.building)
    .filter((building): building is string => building !== null && st.buildingMetas.has(building));
  const building = opened[opened.length - 1] ?? st.buildingMetas.keys().next().value;
  if (building === undefined) return territory;
  return existingPlan(st.buildingMetas, { building, floor: null });
}

// ---------------------------------------------------------------------------
// Действия над черновиком. Экспортируются для других срезов: постановка
// корпуса открывает территорию тем же путём, что и дерево.
// ---------------------------------------------------------------------------

/** Сбрасывает начатое в пределах плана: связь, цепочку, линию, рамку. */
function resetPlanTools(s: State): void {
  s.edgeStartNodeId = null;
  s.chainLastNodeId = null;
  s.lineTool.start = null;
  s.lineTool.end = null;
  s.selectionBox = null;
  s.routeSimulation.follow = false;
}

/** План, на котором идёт операция: корпус и замер ставятся на территории, этаж — на этаже входа. */
function operationPlan(s: State): PlanRef | null {
  if (s.measuring) return { building: null, floor: null };
  if (!s.placing) return null;
  if (s.placing.mode === 'building') return { building: null, floor: null };
  return { building: s.placing.building, floor: openingFloorOf(s.buildingMetas.get(s.placing.building)) };
}

/** Активная вкладка уходит с виду: запоминает план и выбор. */
function leaveActive(s: State): void {
  const tab = activeTabOf(s.mapGroups[s.activeGroup]);
  tab.building = s.currentBuilding;
  tab.floor = s.currentFloor;
  tab.selection = [...s.selectedNodeIds];
}

/** Активной стала другая вкладка: её план открывается, выбор возвращается. */
function enterActive(s: State): void {
  const tab = activeTabOf(s.mapGroups[s.activeGroup]);
  const plan = existingPlan(s.buildingMetas, tab);
  tab.building = plan.building;
  tab.floor = plan.floor;
  const changed = !samePlan(plan, { building: s.currentBuilding, floor: s.currentFloor });
  s.currentBuilding = plan.building;
  s.currentFloor = plan.floor;
  s.selectedNodeIds = new Set(tab.selection.filter((id) => s.nodes.has(id)));
  // Операция живёт на своём плане: ушли с него — она закончилась, как и при
  // выборе другого плана в дереве.
  const operation = operationPlan(s);
  if (operation && !samePlan(operation, plan)) {
    s.placing = null;
    s.measuring = null;
  }
  if (changed) resetPlanTools(s);
}

export function activateTabIn(s: State, group: number, tabId: string): void {
  const target = s.mapGroups[group];
  if (!target?.tabs.some((tab) => tab.id === tabId)) return;
  if (group === s.activeGroup && target.activeTab === tabId) return;
  leaveActive(s);
  target.activeTab = tabId;
  s.activeGroup = group;
  if (group === 1) s.sideCollapsed = false;
  enterActive(s);
}

export function focusGroupIn(s: State, group: number): void {
  if (group === s.activeGroup || !s.mapGroups[group]) return;
  leaveActive(s);
  s.activeGroup = group;
  if (group === 1) s.sideCollapsed = false;
  enterActive(s);
}

/** Добавляет вкладку с планом в карту `group` (или находит открытую) и возвращает её id. */
function tabWithPlan(s: State, group: number, plan: PlanRef): string {
  const target = s.mapGroups[group];
  const open = target.tabs.find((tab) => samePlan(planOfTab(s, group, tab), plan));
  if (open) return open.id;
  const tab = newTab(plan);
  const at = target.tabs.findIndex((item) => item.id === target.activeTab);
  target.tabs.splice(at + 1, 0, tab);
  return tab.id;
}

export function openPlanIn(s: State, requested: PlanRef, how: OpenHow = 'here', focus = true): void {
  const plan = existingPlan(s.buildingMetas, requested);

  if (how === 'side') {
    if (s.mapGroups.length === 1) {
      const tab = newTab(plan);
      s.mapGroups.push({ id: nextId('map'), tabs: [tab], activeTab: tab.id });
    }
    const other = s.activeGroup === 0 ? 1 : 0;
    const id = tabWithPlan(s, other, plan);
    if (other === 1) s.sideCollapsed = false;
    if (focus) activateTabIn(s, other, id);
    else s.mapGroups[other].activeTab = id;
    return;
  }

  const group = s.mapGroups[s.activeGroup];
  const current = activeTabOf(group);
  const open = group.tabs.find((tab) => tab.id !== current.id && samePlan(tab, plan));
  if (open) {
    activateTabIn(s, s.activeGroup, open.id);
    return;
  }
  if (samePlan(plan, { building: s.currentBuilding, floor: s.currentFloor })) return;

  if (how === 'here') {
    current.building = plan.building;
    current.floor = plan.floor;
    current.selection = [];
    enterActive(s);
    return;
  }

  activateTabIn(s, s.activeGroup, tabWithPlan(s, s.activeGroup, plan));
}

/**
 * Показывает план: уже открытый на соседней карте — переходом туда, иначе
 * как просили (`how`). «Показать точку» не открывает второй экземпляр плана,
 * который и так на виду.
 */
export function showPlanIn(s: State, requested: PlanRef, how: OpenHow = 'here'): void {
  const plan = existingPlan(s.buildingMetas, requested);
  if (samePlan(plan, { building: s.currentBuilding, floor: s.currentFloor })) return;
  const other = s.activeGroup === 0 ? 1 : 0;
  const visible = s.mapGroups[other] !== undefined && !(other === 1 && s.sideCollapsed);
  if (how !== 'side' && visible && samePlan(activeTabOf(s.mapGroups[other]), plan)) {
    focusGroupIn(s, other);
    return;
  }
  openPlanIn(s, plan, how);
}

/** Закрывает карту целиком; остаётся другая. */
function closeGroupIn(s: State, group: number): void {
  if (s.mapGroups.length === 1 || !s.mapGroups[group]) return;
  const wasActive = s.activeGroup === group;
  if (!wasActive) leaveActive(s);
  s.mapGroups.splice(group, 1);
  s.activeGroup = 0;
  s.sideCollapsed = false;
  // Осталась та же активная карта — открытый план и начатое не трогаются.
  if (wasActive) enterActive(s);
}

export function closeTabIn(s: State, group: number, tabId: string): void {
  const target = s.mapGroups[group];
  const index = target?.tabs.findIndex((tab) => tab.id === tabId) ?? -1;
  if (index < 0) return;
  if (target.tabs.length === 1) {
    // Последняя вкладка единственной карты остаётся: без неё карте нечего показать.
    closeGroupIn(s, group);
    return;
  }

  const wasShown = target.activeTab === tabId;
  if (wasShown && group === s.activeGroup) {
    target.tabs.splice(index, 1);
    // Как в браузере: открывается соседняя справа, а у крайней — слева.
    target.activeTab = (target.tabs[index] ?? target.tabs[index - 1]).id;
    enterActive(s);
    return;
  }
  target.tabs.splice(index, 1);
  if (wasShown) target.activeTab = (target.tabs[index] ?? target.tabs[index - 1]).id;
}

export function moveTabIn(s: State, from: number, tabId: string, to: number, beforeTab: string | null = null): void {
  const source = s.mapGroups[from];
  const tab = source?.tabs.find((item) => item.id === tabId);
  if (!tab || to < 0 || to > s.mapGroups.length || (to === s.mapGroups.length && to > 1)) return;

  if (from === to) {
    if (beforeTab === tabId) return;
    source.tabs.splice(source.tabs.indexOf(tab), 1);
    const at = beforeTab === null ? -1 : source.tabs.findIndex((item) => item.id === beforeTab);
    source.tabs.splice(at < 0 ? source.tabs.length : at, 0, tab);
    return;
  }
  // Одну-единственную вкладку единственной карты некуда переносить: карта рядом была бы пустой.
  if (s.mapGroups.length === 1 && source.tabs.length === 1) return;

  leaveActive(s);
  const plan: PlanRef = { building: tab.building, floor: tab.floor };
  const index = source.tabs.indexOf(tab);
  source.tabs.splice(index, 1);
  if (source.activeTab === tabId && source.tabs.length > 0) {
    source.activeTab = (source.tabs[index] ?? source.tabs[index - 1]).id;
  }

  if (to === s.mapGroups.length) {
    s.mapGroups.push({ id: nextId('map'), tabs: [tab], activeTab: tab.id });
  } else {
    const target = s.mapGroups[to];
    const twin = target.tabs.find((item) => samePlan(item, plan));
    if (twin) {
      target.activeTab = twin.id;
    } else {
      const at = beforeTab === null ? -1 : target.tabs.findIndex((item) => item.id === beforeTab);
      target.tabs.splice(at < 0 ? target.tabs.length : at, 0, tab);
      target.activeTab = tab.id;
    }
  }

  let active = to;
  if (source.tabs.length === 0) {
    s.mapGroups.splice(from, 1);
    if (from < to) active -= 1;
  }
  s.activeGroup = Math.min(active, s.mapGroups.length - 1);
  s.sideCollapsed = false;
  enterActive(s);
}

/**
 * Вкладки и открытый план согласованы: у активной вкладки — открытый план
 * стора (его меняют и прежние действия — «Отменить», удаление корпуса), у
 * остальных — план, который есть в данных; одинаковых вкладок в карте нет.
 */
export function syncWindowsIn(s: State): void {
  const shown = activeTabOf(s.mapGroups[s.activeGroup]);
  const current: PlanRef = { building: s.currentBuilding, floor: s.currentFloor };
  if (!samePlan(shown, current)) {
    shown.building = s.currentBuilding;
    shown.floor = s.currentFloor;
    shown.selection = [];
    // Выбор живёт в пределах плана: точки прежнего плана справа не остаются.
    const kept = [...s.selectedNodeIds].filter((id) => {
      const node = s.nodes.get(id);
      return node !== undefined && samePlan(planOfNode(node), current);
    });
    if (kept.length !== s.selectedNodeIds.size) s.selectedNodeIds = new Set(kept);
  }

  s.mapGroups.forEach((group, index) => {
    for (const tab of group.tabs) {
      if (index === s.activeGroup && tab.id === group.activeTab) continue;
      const plan = existingPlan(s.buildingMetas, tab);
      if (!samePlan(plan, tab)) {
        tab.building = plan.building;
        tab.floor = plan.floor;
      }
    }
    // Одинаковые вкладки — от удалённых планов: остаётся та, что на виду, или первая.
    const kept: MapTab[] = [];
    for (const tab of group.tabs) {
      const twin = kept.findIndex((item) => samePlan(item, tab));
      if (twin < 0) kept.push(tab);
      else if (tab.id === group.activeTab) kept[twin] = tab;
    }
    if (kept.length !== group.tabs.length) group.tabs = kept;
  });
}

/** Нужна ли `syncWindowsIn`: проверка без черновика — стор меняется часто. */
export function windowsOutOfSync(st: EditorStore): boolean {
  const shown = activeTabOf(st.mapGroups[st.activeGroup]);
  if (!samePlan(shown, { building: st.currentBuilding, floor: st.currentFloor })) return true;
  return st.mapGroups.some((group) => {
    const seen: PlanRef[] = [];
    return group.tabs.some((tab) => {
      if (seen.some((plan) => samePlan(plan, tab))) return true;
      seen.push(tab);
      return !samePlan(existingPlan(st.buildingMetas, tab), tab);
    });
  });
}

/** Номер этажа сменили — вкладки этого этажа идут за ним. */
export function renumberTabsIn(s: State, building: string, floor: number, nextFloor: number): void {
  for (const group of s.mapGroups) {
    for (const tab of group.tabs) if (tab.building === building && tab.floor === floor) tab.floor = nextFloor;
  }
}

const clampRatio = (ratio: number): number =>
  Math.min(SPLIT_LIMITS.max, Math.max(SPLIT_LIMITS.min, Number.isFinite(ratio) ? ratio : SPLIT_LIMITS.initial));

export const createWindowSlice: EditorSlice<WindowSlice> = (set, get) => {
  const first = newTab({ building: null, floor: null });
  return {
    mapGroups: [{ id: nextId('map'), tabs: [first], activeTab: first.id }],
    activeGroup: 0,
    sideCollapsed: false,
    splitRatio: clampRatio(readLayoutPrefs().splitRatio ?? SPLIT_LIMITS.initial),

    openPlan: (plan, how = 'here', options) => set((s) => openPlanIn(s, plan, how, options?.focus ?? true)),
    activateTab: (group, tabId) => set((s) => activateTabIn(s, group, tabId)),
    closeTab: (group, tabId) => set((s) => closeTabIn(s, group, tabId)),
    closeOtherTabs: (group, tabId) =>
      set((s) => {
        const target = s.mapGroups[group];
        if (!target?.tabs.some((tab) => tab.id === tabId)) return;
        activateTabIn(s, group, tabId);
        target.tabs = target.tabs.filter((tab) => tab.id === tabId);
      }),
    moveTab: (from, tabId, to, beforeTab) => set((s) => moveTabIn(s, from, tabId, to, beforeTab ?? null)),
    focusGroup: (group) => set((s) => focusGroupIn(s, group)),

    openSide: (plan) => {
      const st = get();
      const from = planOfGroup(st, st.activeGroup);
      set((s) => openPlanIn(s, plan ?? suggestSidePlan(st, from), 'side', true));
    },
    closeSide: () => set((s) => closeGroupIn(s, s.mapGroups.length - 1)),

    setSideCollapsed: (collapsed) =>
      set((s) => {
        if (s.mapGroups.length < 2) return;
        if (collapsed && s.activeGroup === 1) focusGroupIn(s, 0);
        s.sideCollapsed = collapsed;
        if (!collapsed) focusGroupIn(s, 1);
      }),

    startTransitionFrom: (nodeId, type) => {
      const st = get();
      if (!st.nodes.has(nodeId)) return;
      const kind = type ?? st.transitionType;
      if (st.activeTool !== 'transition') st.setActiveTool('transition');
      const plan = suggestTransitionPlan(get(), nodeId, kind);

      set((s) => {
        s.transitionType = kind;
        s.transitionStartNodeId = nodeId;
        if (!plan) return;
        // Соседняя карта уже показывает нужный план — её не трогаем; иначе
        // план открывается там вкладкой, прежние вкладки остаются.
        const other = s.activeGroup === 0 ? 1 : 0;
        const visible = s.mapGroups[other] !== undefined && !(other === 1 && s.sideCollapsed);
        if (visible && samePlan(planOfGroup(s, other), plan)) return;
        openPlanIn(s, plan, 'side', false);
      });

      const now = get();
      const other = now.activeGroup === 0 ? 1 : 0;
      const side = now.mapGroups[other] && !(other === 1 && now.sideCollapsed) ? planTitle(now.buildingMetas, planOfGroup(now, other)) : null;
      const start = `${TRANSITION_LABELS[kind]} от «${nodeTitle(nodeId, now.aliases)}».`;
      now.showNotice(
        side
          ? `${start} Щёлкните вторую точку на соседней карте — там «${side}», или пустое место: там встанет новая.`
          : `${start} Выберите вторую точку или пустое место на другом плане — этаж или корпус можно переключить.`
      );
    },

    setSplitRatio: (ratio, remember = true) => {
      const next = clampRatio(ratio);
      set((s) => {
        s.splitRatio = next;
      });
      if (remember) updateLayoutPrefs({ splitRatio: next });
    },
  };
};
