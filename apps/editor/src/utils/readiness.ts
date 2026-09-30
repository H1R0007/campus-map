import { CAMPUS_BUILDING_ID, createCampusProjection, findConnectedComponents, floorLabel } from '@campus-map/core';
import type { BuildingMeta, CampusMeta, MapNode, Transition } from '@campus-map/core';
import { buildGraphFromState } from '../stores/editor/graphState';
import { openingFloorOf } from '../stores/editor/viewSlice';
import type { StructureAction } from './structureChecks';
import { planScopeKey } from './planFiles';
import { plural } from './labels';

/**
 * «Готовность карты» (запись 67): что нужно навигатору, чтобы открыть каждый
 * этаж, найти помещение по названию и проложить маршрут со временем в пути.
 *
 * Каждая строка — проверка по данным, а не галочка человека. Строка знает,
 * что не так, и кнопкой ведёт туда, где это исправляют. Для готовой карты
 * список работает так же: правка что-то сломала — строка перестаёт быть
 * выполненной сразу.
 */

export type ReadinessGroup = 'frame' | 'markup' | 'links' | 'result';

export const READINESS_GROUPS: Record<ReadinessGroup, string> = {
  frame: 'Каркас',
  markup: 'Разметка',
  links: 'Переходы',
  result: 'Итог',
};

/** Куда ведёт кнопка строки или находки. */
export type ReadinessAction =
  | StructureAction
  | { kind: 'import' }
  | { kind: 'placeFloor'; building: string; floor: number }
  /** Открыть план и выбрать на нём точки. */
  | { kind: 'show'; building: string | null; floor: number | null; nodeIds: string[] }
  /** Инструмент «Переход», тип «Вход»: этаж входа корпуса и рядом территория. */
  | { kind: 'entrance'; building: string }
  /** Инструмент «Переход», тип «Лестница»: этаж и рядом соседний. */
  | { kind: 'stairs'; building: string; floor: number }
  | { kind: 'problems' }
  | { kind: 'route' }
  | { kind: 'save' };

export interface ReadinessButton {
  label: string;
  action: ReadinessAction;
}

/** Что не так в строке — по одному на корпус, этаж или кусок сети. */
export interface ReadinessProblem {
  text: string;
  button?: ReadinessButton;
}

/**
 * - `done` — выполнено;
 * - `todo` — не выполнено, есть что делать;
 * - `blocked` — сначала нужна другая строка (масштаб, корпуса);
 * - `pending` — ещё считается (сравнение этажей по картинкам).
 */
export type ReadinessState = 'done' | 'todo' | 'blocked' | 'pending';

export interface ReadinessItem {
  id: string;
  group: ReadinessGroup;
  title: string;
  /** Без обязательной строки навигатор работает не полностью; желательная — про удобство. */
  required: boolean;
  state: ReadinessState;
  /** Коротко: что сейчас. */
  status: string;
  /** Зачем это навигатору — в пояснение ⓘ. */
  hint: string;
  problems: ReadinessProblem[];
  button?: ReadinessButton;
}

/** Как этаж лёг на этаж входа — из сравнения силуэтов (`overlay/silhouetteMatch`). */
export type FloorMatch = { overlap: number; areaRatio: number } | 'pending' | 'failed';

export interface ReadinessInput {
  campusMeta: CampusMeta | null;
  buildingMetas: ReadonlyMap<string, BuildingMeta>;
  planFiles: ReadonlyMap<string, string>;
  nodes: ReadonlyMap<string, MapNode>;
  transitions: readonly Transition[];
  aliases: ReadonlyMap<string, readonly string[]>;
  /** Ошибки проверки данных (`validateDataset`). */
  errors: number;
  unsaved: boolean;
  /** Проложенные маршруты «откуда→куда». */
  checkedRoutes: readonly string[];
  /** Сравнение этажей с этажом входа: ключ — `floorMatchKey`; нет ключа — сравнивать нечего. */
  floorMatches: ReadonlyMap<string, FloorMatch>;
}

export const floorMatchKey = (building: string, floor: number): string => `${building}|${floor}`;

/** Доля совпадения силуэтов, ниже которой этаж считается сдвинутым. */
export const FLOOR_MATCH_MIN = 0.85;

/** Во сколько раз площади этажей могут различаться, не вызывая вопросов о масштабе. */
const AREA_RATIO_MAX = 2;

/** Сколько маршрутов проложить, чтобы проверка маршрутов считалась сделанной. */
export const ROUTES_TO_CHECK = 2;

/** Полей привязки, без которых корпус не стоит на территории. */
const PLACEMENT_FIELDS = new Set(['metersPerPixel', 'originMeters', 'rotationDeg']);

const count = (n: number, forms: [string, string, string]) => `${n} ${plural(n, forms)}`;

function planName(metas: ReadonlyMap<string, BuildingMeta>, building: string | null, floor: number | null): string {
  if (building === null || building === CAMPUS_BUILDING_ID) return 'Территория';
  const meta = metas.get(building);
  const name = meta?.name ?? building;
  return floor === null ? name : `${name}, этаж ${floorLabel(meta, floor)}`;
}

const planOf = (node: MapNode): { building: string | null; floor: number | null } =>
  node.building === CAMPUS_BUILDING_ID ? { building: null, floor: null } : { building: node.building, floor: node.floor };

const planKeyOf = (node: MapNode) => (node.building === CAMPUS_BUILDING_ID ? CAMPUS_BUILDING_ID : `${node.building}|${node.floor}`);

/** Итог: строки по порядку, сколько выполнено и что делать дальше. */
export interface Readiness {
  items: ReadinessItem[];
  done: number;
  total: number;
  /** Первая невыполненная обязательная строка, а если все выполнены — желательная. */
  next: ReadinessItem | null;
}

export function readiness(input: ReadinessInput): Readiness {
  const items = [
    ...frameItems(input),
    ...markupItems(input),
    ...linkItems(input),
    ...resultItems(input),
  ];
  const done = items.filter((item) => item.state === 'done').length;
  const open = items.filter((item) => item.state === 'todo' || item.state === 'blocked');
  const next = open.find((item) => item.required) ?? open[0] ?? null;
  return { items, done, total: items.length, next };
}

// ---------------------------------------------------------------------------
// Каркас: планы, масштаб, корпуса на территории, высоты, совпадение этажей.
// ---------------------------------------------------------------------------

function frameItems(input: ReadinessInput): ReadinessItem[] {
  const { campusMeta, buildingMetas, planFiles, floorMatches } = input;
  const items: ReadinessItem[] = [];
  const buildings = [...buildingMetas.values()];
  const mpp = campusMeta?.metersPerPixel;

  const territoryPlan = campusMeta !== null && planFiles.has(planScopeKey(null, null));
  items.push({
    id: 'territoryPlan',
    group: 'frame',
    title: 'У территории есть план',
    required: true,
    state: territoryPlan ? 'done' : 'todo',
    status: territoryPlan ? 'План на месте' : 'Плана нет',
    hint: 'Без плана территории навигатор покажет вместо неё пустое поле, а корпуса не на чем будет разместить.',
    problems: [],
    button: territoryPlan ? undefined : { label: 'Загрузить план…', action: { kind: 'plan', building: null, floor: null } },
  });

  items.push({
    id: 'territoryScale',
    group: 'frame',
    title: 'Масштаб территории задан',
    required: true,
    state: mpp !== undefined ? 'done' : 'todo',
    status: mpp !== undefined ? `1 пикс. = ${String(Math.round(mpp * 10000) / 10000).replace('.', ',')} м` : 'Не задан',
    hint: 'Сколько метров в пикселе плана территории: два места на плане и расстояние между ними. Без масштаба навигатор не показывает время в пути, а корпуса не разместить.',
    problems: [],
    button: mpp !== undefined ? undefined : { label: 'Измерить масштаб…', action: { kind: 'measure' } },
  });

  const planProblems: ReadinessProblem[] = [];
  for (const meta of buildings) {
    if (meta.floors.length === 0) {
      planProblems.push({
        text: `${meta.name}: этажей нет`,
        button: { label: 'Добавить этажи…', action: { kind: 'open', building: meta.id, floor: null } },
      });
      continue;
    }
    for (const floor of meta.floors) {
      if (planFiles.has(planScopeKey(meta.id, floor.floor))) continue;
      planProblems.push({
        text: `${planName(buildingMetas, meta.id, floor.floor)}: плана нет`,
        button: { label: 'Загрузить план…', action: { kind: 'plan', building: meta.id, floor: floor.floor } },
      });
    }
  }
  const floorCount = buildings.reduce((sum, meta) => sum + meta.floors.length, 0);
  items.push({
    id: 'floorPlans',
    group: 'frame',
    title: 'У каждого корпуса есть этажи, у каждого этажа — план',
    required: true,
    state: buildings.length === 0 ? 'todo' : planProblems.length === 0 ? 'done' : 'todo',
    status:
      buildings.length === 0
        ? 'Корпусов пока нет'
        : planProblems.length === 0
          ? `${count(buildings.length, ['корпус', 'корпуса', 'корпусов'])}, ${count(floorCount, ['этаж', 'этажа', 'этажей'])} — у всех есть план`
          : `Не хватает: ${planProblems.length}`,
    hint: 'Корпус без этажей в навигаторе не открыть, а этаж без плана показывается пустым полем.',
    problems: planProblems,
    button:
      buildings.length === 0 ? { label: 'Загрузить планы…', action: { kind: 'import' } } : planProblems[0]?.button,
  });

  // Размещение и высоты — по недостающим полям привязки, как у навигатора.
  const missing = new Map<string, Set<string>>();
  if (campusMeta) {
    for (const floor of createCampusProjection(campusMeta, buildingMetas.values()).unplacedFloors) {
      if (floor.buildingId === CAMPUS_BUILDING_ID) continue;
      const fields = missing.get(floor.buildingId) ?? new Set<string>();
      for (const field of floor.missing) fields.add(field);
      missing.set(floor.buildingId, fields);
    }
  }
  const withFloors = buildings.filter((meta) => meta.floors.length > 0);
  const unplaced = withFloors.filter((meta) => [...(missing.get(meta.id) ?? [])].some((field) => PLACEMENT_FIELDS.has(field)));
  const placedBlocked = mpp === undefined || withFloors.length === 0;
  items.push({
    id: 'placed',
    group: 'frame',
    title: 'Каждый корпус размещён на территории',
    required: true,
    state: placedBlocked ? 'blocked' : unplaced.length === 0 ? 'done' : 'todo',
    status:
      mpp === undefined
        ? 'Сначала масштаб территории'
        : withFloors.length === 0
          ? 'Корпусов с этажами пока нет'
          : unplaced.length === 0
            ? 'Все корпуса на местах'
            : `Не размещены: ${unplaced.map((meta) => meta.name).join(', ')}`,
    hint: 'План корпуса ложится поверх территории — сдвинуть, повернуть, для точности приколоть угол булавкой. Пока хоть один корпус не на месте, навигатор не показывает время в пути во всём кампусе.',
    problems: placedBlocked
      ? []
      : unplaced.map((meta) => ({ text: `${meta.name} не размещён`, button: { label: 'Разместить…', action: { kind: 'place', building: meta.id } } })),
    button:
      mpp === undefined
        ? { label: 'Измерить масштаб…', action: { kind: 'measure' } }
        : unplaced[0]
          ? { label: `Разместить «${unplaced[0].name}»…`, action: { kind: 'place', building: unplaced[0].id } }
          : undefined,
  });

  const noHeights = withFloors.filter((meta) => [...(missing.get(meta.id) ?? [])].some((field) => field.startsWith('elevationMeters')));
  items.push({
    id: 'heights',
    group: 'frame',
    title: 'Высоты этажей заданы',
    required: true,
    state: withFloors.length === 0 ? 'blocked' : noHeights.length === 0 ? 'done' : 'todo',
    status:
      withFloors.length === 0
        ? 'Корпусов с этажами пока нет'
        : noHeights.length === 0
          ? 'Заданы у всех корпусов'
          : `Не заданы: ${noHeights.map((meta) => meta.name).join(', ')}`,
    hint: 'Высота первого этажа и высота этажа у корпуса: по ним навигатор считает время на лестницах и в лифте.',
    problems: noHeights.map((meta) => ({
      text: `${meta.name}: высоты не заданы`,
      button: { label: 'Открыть корпус', action: { kind: 'open', building: meta.id, floor: openingFloorOf(meta) } },
    })),
    button: noHeights[0]
      ? { label: `Открыть «${noHeights[0].name}»`, action: { kind: 'open', building: noHeights[0].id, floor: openingFloorOf(noHeights[0]) } }
      : undefined,
  });

  // Этажи совпадают с этажом входа — по силуэтам зданий на планах.
  const matchProblems: ReadinessProblem[] = [];
  let pending = 0;
  let compared = 0;
  let failed = 0;
  for (const meta of buildings) {
    for (const floor of meta.floors) {
      const match = floorMatches.get(floorMatchKey(meta.id, floor.floor));
      if (match === undefined) continue;
      if (match === 'failed') {
        failed += 1;
        continue;
      }
      if (match === 'pending') {
        pending += 1;
        continue;
      }
      compared += 1;
      const shifted = match.overlap < FLOOR_MATCH_MIN;
      const sized = match.areaRatio > AREA_RATIO_MAX || match.areaRatio < 1 / AREA_RATIO_MAX;
      if (!shifted && !sized) continue;
      matchProblems.push({
        text: shifted
          ? `${planName(buildingMetas, meta.id, floor.floor)}: совпадает с этажом входа на ${Math.round(match.overlap * 100)}%`
          : `${planName(buildingMetas, meta.id, floor.floor)}: размер отличается от этажа входа в ${String(Math.round(Math.max(match.areaRatio, 1 / match.areaRatio) * 10) / 10).replace('.', ',')} раза — проверьте масштаб`,
        button: { label: 'Совместить…', action: { kind: 'placeFloor', building: meta.id, floor: floor.floor } },
      });
    }
  }
  items.push({
    id: 'floorsMatch',
    group: 'frame',
    title: 'Этажи совпадают с этажом входа',
    required: false,
    // Ни один план не прочитался — не «совпадают», а «не проверено».
    state: pending > 0 ? 'pending' : matchProblems.length > 0 ? 'todo' : compared === 0 && failed > 0 ? 'blocked' : 'done',
    status:
      pending > 0
        ? 'Сравниваю планы этажей…'
        : matchProblems.length > 0
          ? `Не совпадают: ${matchProblems.length}`
          : compared > 0
            ? `Совпадают: ${count(compared, ['этаж', 'этажа', 'этажей'])}`
            : failed > 0
              ? 'Планы этажей не прочитались — сравнить не удалось'
              : 'Сравнивать нечего',
    hint: 'Очертания здания на плане каждого этажа сравниваются с этажом входа — так же, как их показывает совмещение. Если этаж сдвинут, лестницы на соседних этажах не встанут одна над другой.',
    problems: matchProblems,
    button: matchProblems[0]?.button,
  });

  return items;
}

// ---------------------------------------------------------------------------
// Разметка: точки на этажах, сеть каждого плана, названия помещений.
// ---------------------------------------------------------------------------

function markupItems(input: ReadinessInput): ReadinessItem[] {
  const { buildingMetas, nodes, transitions, aliases } = input;
  const items: ReadinessItem[] = [];

  const byPlan = new Map<string, MapNode[]>();
  for (const node of nodes.values()) {
    const key = planKeyOf(node);
    const list = byPlan.get(key);
    if (list) list.push(node);
    else byPlan.set(key, [node]);
  }

  const empty: ReadinessProblem[] = [];
  let floors = 0;
  for (const meta of buildingMetas.values()) {
    for (const floor of meta.floors) {
      floors += 1;
      if (byPlan.has(`${meta.id}|${floor.floor}`)) continue;
      empty.push({
        text: `${planName(buildingMetas, meta.id, floor.floor)}: точек нет`,
        button: { label: 'Открыть этаж', action: { kind: 'open', building: meta.id, floor: floor.floor } },
      });
    }
  }
  items.push({
    id: 'points',
    group: 'markup',
    title: 'На каждом этаже есть точки',
    required: true,
    state: floors === 0 ? 'blocked' : empty.length === 0 ? 'done' : 'todo',
    status: floors === 0 ? 'Этажей пока нет' : empty.length === 0 ? 'На всех этажах' : `Пустых этажей: ${empty.length}`,
    hint: 'Точки — двери помещений, коридоры, лестницы. По ним навигатор находит помещения и прокладывает маршрут; на этаже без точек нечего найти.',
    problems: empty,
    button: empty[0]?.button,
  });

  // Сеть плана: куски связей, из которых нет перехода на другой план, и
  // одиночные точки. Крыло, которое соединено через другой этаж, — не
  // ошибка: у него есть свой переход.
  const transitionEnds = new Set<string>();
  for (const transition of transitions) {
    transitionEnds.add(transition.fromNode);
    transitionEnds.add(transition.toNode);
  }
  const cutOff: ReadinessProblem[] = [];
  const unnamed: ReadinessProblem[] = [];
  let unnamedCount = 0;
  for (const planNodes of byPlan.values()) {
    const ids = new Set(planNodes.map((node) => node.id));
    const seen = new Set<string>();
    const pieces: string[][] = [];
    for (const start of planNodes) {
      if (seen.has(start.id)) continue;
      const piece: string[] = [];
      const queue = [start.id];
      seen.add(start.id);
      for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const current = queue[cursor];
        piece.push(current);
        for (const next of nodes.get(current)?.neighbors ?? []) {
          if (!ids.has(next) || seen.has(next)) continue;
          seen.add(next);
          queue.push(next);
        }
      }
      pieces.push(piece);
    }
    const { building, floor } = planOf(planNodes[0]);
    if (pieces.length > 1) {
      const lost = pieces.filter((piece) => piece.length === 1 || !piece.some((id) => transitionEnds.has(id))).flat();
      if (lost.length > 0) {
        cutOff.push({
          text: `${planName(buildingMetas, building, floor)}: ${count(lost.length, ['точка', 'точки', 'точек'])} отдельно от остальных`,
          button: { label: 'Показать', action: { kind: 'show', building, floor, nodeIds: lost } },
        });
      }
    }

    // Помещение — тупик сети: у двери одна связь с коридором. Без названия
    // поиск навигатора его не найдёт.
    const nameless = planNodes
      .filter((node) => node.neighbors.length === 1 && !transitionEnds.has(node.id) && (aliases.get(node.id)?.length ?? 0) === 0)
      .map((node) => node.id);
    if (nameless.length > 0) {
      unnamedCount += nameless.length;
      unnamed.push({
        text: `${planName(buildingMetas, building, floor)}: без названия — ${count(nameless.length, ['тупиковая точка', 'тупиковые точки', 'тупиковых точек'])}`,
        button: { label: 'Показать', action: { kind: 'show', building, floor, nodeIds: nameless } },
      });
    }
  }
  items.push({
    id: 'onePlanNetwork',
    group: 'markup',
    title: 'Точки каждого плана — одна сеть',
    required: true,
    state: nodes.size === 0 ? 'blocked' : cutOff.length === 0 ? 'done' : 'todo',
    status: nodes.size === 0 ? 'Точек пока нет' : cutOff.length === 0 ? 'Оторванных кусков нет' : `Планов с оторванными точками: ${cutOff.length}`,
    hint: 'Одиночная точка или кусок связей, из которого нет ни коридора к остальным, ни лестницы на другой этаж: до них маршрут не дойдёт.',
    problems: cutOff,
    button: cutOff[0]?.button,
  });

  items.push({
    id: 'roomsNamed',
    group: 'markup',
    title: 'Помещения названы',
    required: false,
    state: nodes.size === 0 ? 'blocked' : unnamed.length === 0 ? 'done' : 'todo',
    status: nodes.size === 0 ? 'Точек пока нет' : unnamed.length === 0 ? 'У всех тупиковых точек есть название' : `Без названия: ${unnamedCount}`,
    hint: 'Тупиковая точка — обычно дверь помещения: у неё одна связь с коридором. Без названия поиск навигатора её не найдёт. Если это просто конец коридора, название не нужно.',
    problems: unnamed,
    button: unnamed[0]?.button,
  });

  return items;
}

// ---------------------------------------------------------------------------
// Переходы: вход в каждый корпус, лестницы между этажами, связность карты.
// ---------------------------------------------------------------------------

function linkItems(input: ReadinessInput): ReadinessItem[] {
  const { buildingMetas, nodes, transitions, campusMeta } = input;
  const items: ReadinessItem[] = [];
  const withFloors = [...buildingMetas.values()].filter((meta) => meta.floors.length > 0);

  const entered = new Set<string>();
  const floorLinks = new Map<string, Map<number, Set<number>>>();
  for (const transition of transitions) {
    const from = nodes.get(transition.fromNode);
    const to = nodes.get(transition.toNode);
    if (!from || !to) continue;
    if (from.building === CAMPUS_BUILDING_ID && to.building !== CAMPUS_BUILDING_ID) entered.add(to.building);
    if (to.building === CAMPUS_BUILDING_ID && from.building !== CAMPUS_BUILDING_ID) entered.add(from.building);
    if (from.building === to.building && from.building !== CAMPUS_BUILDING_ID && from.floor !== to.floor) {
      const links = floorLinks.get(from.building) ?? new Map<number, Set<number>>();
      links.set(from.floor, (links.get(from.floor) ?? new Set()).add(to.floor));
      links.set(to.floor, (links.get(to.floor) ?? new Set()).add(from.floor));
      floorLinks.set(from.building, links);
    }
  }

  const closed = withFloors.filter((meta) => !entered.has(meta.id));
  items.push({
    id: 'entrances',
    group: 'links',
    title: 'Каждый корпус соединён с территорией',
    required: true,
    state: withFloors.length === 0 ? 'blocked' : closed.length === 0 ? 'done' : 'todo',
    status:
      withFloors.length === 0
        ? 'Корпусов с этажами пока нет'
        : closed.length === 0
          ? 'Во все корпуса есть вход'
          : `Без входа: ${closed.map((meta) => meta.name).join(', ')}`,
    hint: 'Вход — переход между точкой у двери на этаже и точкой у той же двери на территории. Без него маршрут в корпус не проложить.',
    problems: closed.map((meta) => ({ text: `${meta.name}: входа нет`, button: { label: 'Добавить вход…', action: { kind: 'entrance', building: meta.id } } })),
    button: closed[0] ? { label: `Добавить вход в «${closed[0].name}»…`, action: { kind: 'entrance', building: closed[0].id } } : undefined,
  });

  // До каждого этажа — от этажа входа по лестницам и лифтам корпуса.
  const unreachable: ReadinessProblem[] = [];
  let multiFloor = 0;
  for (const meta of withFloors) {
    if (meta.floors.length < 2) continue;
    multiFloor += 1;
    const start = openingFloorOf(meta)!;
    const links = floorLinks.get(meta.id) ?? new Map<number, Set<number>>();
    const reached = new Set([start]);
    const queue = [start];
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      for (const next of links.get(queue[cursor]) ?? []) {
        if (reached.has(next)) continue;
        reached.add(next);
        queue.push(next);
      }
    }
    for (const floor of meta.floors) {
      if (reached.has(floor.floor)) continue;
      unreachable.push({
        text: `${planName(buildingMetas, meta.id, floor.floor)}: не связан с этажом входа`,
        button: { label: 'Добавить лестницу…', action: { kind: 'stairs', building: meta.id, floor: floor.floor } },
      });
    }
  }
  items.push({
    id: 'floorsLinked',
    group: 'links',
    title: 'Этажи корпусов соединены',
    required: true,
    state: withFloors.length === 0 ? 'blocked' : unreachable.length === 0 ? 'done' : 'todo',
    status:
      withFloors.length === 0
        ? 'Корпусов с этажами пока нет'
        : unreachable.length === 0
          ? multiFloor > 0
            ? 'До каждого этажа можно дойти'
            : 'Многоэтажных корпусов нет'
          : `Отрезанных этажей: ${unreachable.length}`,
    hint: 'От этажа входа до каждого этажа корпуса — лестницей или лифтом, хотя бы через другие этажи.',
    problems: unreachable,
    button: unreachable[0]?.button,
  });

  // Вся карта — одна сеть: из любого места можно дойти до любого.
  const lost: ReadinessProblem[] = [];
  if (nodes.size > 0) {
    const { components } = findConnectedComponents(buildGraphFromState({ nodes, transitions, campusMeta, buildingMetas }));
    const main = components.reduce((best, piece) => (piece.length > best.length ? piece : best), components[0] ?? []);
    const byPlan = new Map<string, string[]>();
    for (const piece of components) {
      if (piece === main) continue;
      for (const id of piece) {
        const node = nodes.get(id);
        if (!node) continue;
        const key = planKeyOf(node);
        const list = byPlan.get(key);
        if (list) list.push(id);
        else byPlan.set(key, [id]);
      }
    }
    for (const ids of byPlan.values()) {
      const { building, floor } = planOf(nodes.get(ids[0])!);
      lost.push({
        text: `${planName(buildingMetas, building, floor)}: ${count(ids.length, ['точка', 'точки', 'точек'])} не связаны с остальной картой`,
        button: { label: 'Показать', action: { kind: 'show', building, floor, nodeIds: ids } },
      });
    }
  }
  items.push({
    id: 'reachable',
    group: 'links',
    title: 'Из любого места можно дойти до любого',
    required: true,
    state: nodes.size === 0 ? 'blocked' : lost.length === 0 ? 'done' : 'todo',
    status: nodes.size === 0 ? 'Точек пока нет' : lost.length === 0 ? 'Вся карта — одна сеть' : `Отрезано мест на планах: ${lost.length}`,
    hint: 'Все точки карты — через связи и переходы — одна сеть. Точку вне сети навигатор найдёт поиском, но маршрут к ней не построит.',
    problems: lost,
    button: lost[0]?.button,
  });

  return items;
}

// ---------------------------------------------------------------------------
// Итог: ошибки в данных, проверка маршрутов, сохранение.
// ---------------------------------------------------------------------------

function resultItems(input: ReadinessInput): ReadinessItem[] {
  const { errors, unsaved, checkedRoutes, nodes } = input;
  const routes = checkedRoutes.filter((key) => {
    const [from, to] = key.split('→');
    return nodes.has(from) && nodes.has(to);
  }).length;

  return [
    {
      id: 'noErrors',
      group: 'result',
      title: 'В данных нет ошибок',
      required: true,
      state: errors === 0 ? 'done' : 'todo',
      status: errors === 0 ? 'Ошибок нет' : `Ошибок: ${errors}`,
      hint: 'Связи с несуществующими точками, связи в одну сторону, точки на несуществующих этажах. Многое исправляет кнопка «Исправить что можно» в «Замечаниях».',
      problems: [],
      button: errors === 0 ? undefined : { label: 'Открыть список', action: { kind: 'problems' } },
    },
    {
      id: 'routeChecked',
      group: 'result',
      title: 'Маршрут проверен',
      required: false,
      state: routes >= ROUTES_TO_CHECK ? 'done' : 'todo',
      status: routes === 0 ? 'Маршрутов не прокладывали' : `Проложено маршрутов: ${routes}`,
      hint: `Проложите хотя бы ${ROUTES_TO_CHECK} маршрута во вкладке «Маршрут» — например, от входа в кампус до аудитории на верхнем этаже — и сверьте путь и время на глаз. Редактор помнит, что маршруты проложены.`,
      problems: [],
      button: routes >= ROUTES_TO_CHECK ? undefined : { label: 'Проложить маршрут', action: { kind: 'route' } },
    },
    {
      id: 'saved',
      group: 'result',
      title: 'Всё сохранено',
      required: true,
      state: unsaved ? 'todo' : 'done',
      status: unsaved ? 'Есть несохранённые правки' : 'Сохранено',
      hint: 'Навигатор читает сохранённые данные. Несохранённое держится черновиком только в этом браузере.',
      problems: [],
      button: unsaved ? { label: 'Сохранить', action: { kind: 'save' } } : undefined,
    },
  ];
}
