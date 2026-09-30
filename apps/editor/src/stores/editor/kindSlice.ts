import { CAMPUS_BUILDING_ID, CAMPUS_FLOOR } from '@campus-map/core';
import type { MapNode, PlaceCategory, PlaceKind, Transition, TransitionType } from '@campus-map/core';
import { useHistoryStore } from '../historyStore';
import type { AliasSnapshot } from '../historyStore';
import { TRANSITION_LABELS, nodesCount, plural } from '../../utils/labels';
import { kindNameTemplate, visibleKinds } from '../../utils/placeKinds';
import { nodeIdForKind } from '../../utils/nodeIds';
import { snapshotNeighbors, syncPortals } from './graphState';
import type { EditorSlice } from './types';
import { STACK_TRANSITIONS, idMinter, nearestNodeOnPlan, openPlanOf, placementPoint } from './placement';

/**
 * Постановка по видам: щелчок кистью ставит точку вида, лестницу или лифт
 * на всех этажах, второй конец перехода; ряд точек. Одна постановка — одна
 * запись отмены (запись 40).
 */
export interface KindSlice {
  /**
   * Ставит точку выбранного вида: название, связь с ближайшей точкой плана
   * или с предыдущей точкой линии, вид места для навигатора.
   */
  placeKindNode: (x: number, y: number, options?: { align?: boolean; linkToLast?: boolean }) => string;
  /**
   * Лестница или лифт сразу на всех этажах открытого корпуса — по выбранному
   * в инструменте «Переход» типу. Соседние этажи связываются переходами.
   *
   * @returns id точки на открытом этаже; `null`, если выбранный тип так не
   *          ставится (вход, переход между корпусами — только вручную)
   */
  placeTransitionStack: (x: number, y: number, options?: { align?: boolean; linkToLast?: boolean }) => string | null;
  /**
   * Второй конец начатого вручную перехода — новой точкой на пустом месте
   * открытого плана: у входа на пустой территории щёлкнуть больше не по чему.
   * Точка связывается с ближайшей на своём плане; точка и переход — одна
   * правка.
   *
   * @returns id новой точки; `'samePlan'` — план тот же, что у начала;
   *          `null` — перехода не начато
   */
  placeTransitionEnd: (x: number, y: number, options?: { align?: boolean }) => string | 'samePlan' | null;
  lineConfirm: () => void;
}

/** Что ставит щелчок: точку на открытом плане или стопку по этажам корпуса. */
interface PlacementSpec {
  /** По нему строится id: `a1_toilet`, `a2_stairs`. */
  idKind: Pick<PlaceKind, 'id' | 'name'>;
  /** Как действие называется на кнопке отмены. */
  label: string;
  point: { x: number; y: number };
  /** Этажи, на которых встанут точки; `null` — территория. */
  floors: (number | null)[];
  isPortal: boolean;
  /** Каким переходом связать соседние этажи стопки. */
  transition: TransitionType | null;
  /** Название, которое ставится сразу; `null` — без названия. */
  name: string | null;
  category: PlaceCategory | null;
  /** Соединять с ближайшей точкой своего плана. */
  connect: boolean;
  /** С какой точкой связать вместо ближайшей: предыдущая точка линии или Shift. */
  linkFrom: string | null;
  /** Продолжать линию от новой точки. */
  chain: boolean;
  /**
   * Начало перехода, начатого вручную: новая точка — его второй конец, переход
   * (`transition`) ставится той же правкой.
   */
  transitionFrom?: string;
}

type StoreSet = Parameters<EditorSlice<KindSlice>>[0];
type StoreGet = Parameters<EditorSlice<KindSlice>>[1];

/**
 * Ставит точки по описанию щелчка — одной записью отмены: после Ctrl+Z на
 * плане не остаётся половины работы (точки без связи или названия без точки).
 *
 * @returns id точки на открытом плане: её выбирают и от неё продолжают линию
 */
function commitPlacement(set: StoreSet, get: StoreGet, spec: PlacementSpec): string {
  const st = get();
  const building = st.currentBuilding;
  const floor = st.currentFloor;
  const transitionsBefore = st.transitions.map((transition) => ({ ...transition }));

  const created: MapNode[] = [];
  const aliases: AliasSnapshot[] = [];
  const categories: { id: string; category: PlaceCategory }[] = [];
  const links: { nodeId: string; nearestId: string }[] = [];
  const usedIds = new Set<string>();

  for (const planFloor of spec.floors) {
    const id = nodeIdForKind(spec.idKind, building, planFloor, (candidate) => st.nodes.has(candidate) || usedIds.has(candidate));
    usedIds.add(id);
    const node: MapNode = {
      id,
      x: spec.point.x,
      y: spec.point.y,
      building: planFloor === null ? CAMPUS_BUILDING_ID : (building ?? CAMPUS_BUILDING_ID),
      floor: planFloor === null ? CAMPUS_FLOOR : planFloor,
      neighbors: [],
      isPortal: spec.isPortal,
    };
    created.push(node);

    if (spec.name !== null) {
      aliases.push({ id, names: [spec.name] });
      if (spec.category !== null) categories.push({ id, category: spec.category });
    }

    // К чему цеплять, решается по тому, что на плане уже есть: точки стопки
    // друг другу не соседи — они на разных этажах.
    //
    // Точка линии (коридор) цепляется к предыдущей точке линии, иначе она
    // прилипала бы к ближайшей двери и коридор получался бы зигзагом.
    // Shift+щелчок связывает с последней поставленной точкой: так в большом
    // кабинете ставят вторую точку внутри, связанную с дверью. Связь с
    // предыдущей — только в пределах плана: ребро сквозь перекрытие на карте
    // не видно, а маршрут по нему шёл бы через потолок.
    const linkNode = spec.linkFrom === null ? undefined : st.nodes.get(spec.linkFrom);
    if (linkNode && linkNode.building === node.building && linkNode.floor === node.floor) {
      links.push({ nodeId: id, nearestId: linkNode.id });
    } else if (spec.connect) {
      const nearest = nearestNodeOnPlan(st.nodes, node);
      if (nearest) links.push({ nodeId: id, nearestId: nearest.id });
    }
  }

  // Точка открытого плана: её выбирают, от неё продолжается линия, её id
  // возвращается. У стопки это этаж на экране, а не нижний.
  const primary = created[Math.max(0, spec.floors.indexOf(floor))];

  const neighborsBefore = snapshotNeighbors(
    st.nodes,
    links.map((link) => link.nearestId)
  );

  // Переходы между соседними этажами стопки — или от начала перехода, начатого
  // вручную, к новой точке.
  const newTransitions: Transition[] = [];
  if (spec.transition !== null) {
    for (let i = 0; i + 1 < created.length; i += 1) {
      newTransitions.push({ fromNode: created[i].id, toNode: created[i + 1].id, type: spec.transition });
    }
    if (spec.transitionFrom !== undefined) {
      newTransitions.push({ fromNode: spec.transitionFrom, toNode: primary.id, type: spec.transition });
    }
  }

  set((s) => {
    for (const node of created) s.nodes.set(node.id, { ...node, neighbors: [] });

    for (const { nodeId, nearestId } of links) {
      const node = s.nodes.get(nodeId);
      const nearest = s.nodes.get(nearestId);
      if (!node || !nearest) continue;
      node.neighbors.push(nearestId);
      nearest.neighbors.push(nodeId);
    }

    s.transitions = [...s.transitions, ...newTransitions];
    syncPortals(s);
    for (const alias of aliases) s.aliases.set(alias.id, [...alias.names]);
    for (const { id, category } of categories) s.aliasCategories.set(id, category);
    s.selectedNodeIds = new Set([primary.id]);
    s.chainLastNodeId = spec.chain ? primary.id : null;
    s.lastPlacedNodeId = primary.id;
    if (spec.transitionFrom !== undefined) s.transitionStartNodeId = null;
  });

  const after = get();
  useHistoryStore.getState().push({
    type: 'BATCH',
    description:
      created.length > 1
        ? `${spec.label} на ${created.length} ${plural(created.length, ['этаже', 'этажах', 'этажах'])}`
        : spec.label,
    undoData: {
      kind: 'placeKind',
      nodeIds: created.map((node) => node.id),
      neighborsBefore,
      transitionsBefore,
      chainBefore: st.chainLastNodeId,
      lastPlacedBefore: st.lastPlacedNodeId,
    },
    redoData: {
      kind: 'placeKind',
      nodes: created.map((node) => ({ ...after.nodes.get(node.id)! })),
      neighbors: snapshotNeighbors(after.nodes, [
        ...created.map((node) => node.id),
        ...links.map((link) => link.nearestId),
      ]),
      transitions: after.transitions.map((transition) => ({ ...transition })),
      aliases,
      categories,
      chainAfter: spec.chain ? primary.id : null,
      lastPlacedAfter: primary.id,
    },
  });

  return primary.id;
}

export const createKindSlice: EditorSlice<KindSlice> = (set, get) => ({
  /**
   * Ставит точку выбранного вида — всё, что вид обещает, за один щелчок:
   * название по шаблону, связь с ближайшей точкой плана или с предыдущей
   * точкой линии, вид места для навигатора.
   *
   * @returns id поставленной точки
   */
  placeKindNode: (x, y, options = {}) => {
    const st = get();
    const kind = visibleKinds(st.placeKinds).find((item) => item.id === st.activeKindId);
    const point = placementPoint(st, x, y, options.align !== false);
    // Вид могли удалить в окне «Все виды»: тогда ставится простая точка, но
    // туда же, куда показывал призрак.
    if (!kind) return st.addNode(point.x, point.y);

    const building = st.currentBuilding;
    const floor = st.currentFloor;
    const nameTemplate = kindNameTemplate(kind, building === null ? undefined : st.buildingMetas.get(building)?.name, floor);
    const wantsNumber = (kind.namePattern ?? '').includes('{номер}');

    const primary = commitPlacement(set, get, {
      idKind: kind,
      label: kind.name,
      point,
      floors: [floor],
      isPortal: false,
      transition: null,
      // Название ставится сразу, только если дописывать нечего: «Туалет» —
      // готово, «А-3…» ждёт номера от человека.
      name: nameTemplate.length > 0 && !wantsNumber ? nameTemplate : null,
      // Вид — место быстрого поиска: его id и есть вид места у точки.
      category: kind.place ? kind.id : null,
      connect: kind.connect === true,
      linkFrom: options.linkToLast ? st.lastPlacedNodeId : kind.chain ? st.chainLastNodeId : null,
      chain: kind.chain === true,
    });

    // Шаблон с номером — человеку остаётся дописать номер: курсор в поле
    // названия прямо в карточке, с уже подставленным началом.
    if (wantsNumber) get().editNodeName(primary, nameTemplate);

    return primary;
  },

  placeTransitionStack: (x, y, options = {}) => {
    const st = get();
    const type = st.transitionType;
    if (!STACK_TRANSITIONS.includes(type)) return null;

    const building = st.currentBuilding;
    const floor = st.currentFloor;
    // Этажи стопки — все этажи открытого корпуса. Открытый этаж входит
    // всегда — даже у корпуса, этажи которого в данных ещё не описаны: иначе
    // щелчок не поставил бы ничего. На территории этажей нет: одна точка.
    const buildingFloors =
      building === null || floor === null ? [] : (st.buildingMetas.get(building)?.floors ?? []).map((meta) => meta.floor);
    const floors: (number | null)[] =
      floor !== null && buildingFloors.includes(floor) ? [...buildingFloors].sort((a, b) => a - b) : [floor];

    return commitPlacement(set, get, {
      idKind: { id: type, name: TRANSITION_LABELS[type] },
      label: TRANSITION_LABELS[type],
      point: placementPoint(st, x, y, options.align !== false),
      floors,
      isPortal: true,
      transition: type,
      name: null,
      category: null,
      connect: true,
      linkFrom: options.linkToLast ? st.lastPlacedNodeId : null,
      chain: false,
    });
  },

  placeTransitionEnd: (x, y, options = {}) => {
    const st = get();
    const start = st.transitionStartNodeId === null ? undefined : st.nodes.get(st.transitionStartNodeId);
    if (!start) return null;
    const plan = openPlanOf(st);
    if (start.building === plan.building && start.floor === plan.floor) return 'samePlan';

    const type = st.transitionType;
    return commitPlacement(set, get, {
      idKind: { id: type, name: TRANSITION_LABELS[type] },
      label: TRANSITION_LABELS[type],
      point: placementPoint(st, x, y, options.align !== false),
      floors: [plan.building === CAMPUS_BUILDING_ID ? null : plan.floor],
      isPortal: true,
      transition: type,
      name: null,
      category: null,
      connect: true,
      linkFrom: null,
      chain: false,
      transitionFrom: start.id,
    });
  },

  lineConfirm: () => {
    const st = get();
    const lt = st.lineTool;
    if (!lt.start || !lt.end) return;

    const count = Math.max(2, Math.min(50, lt.count));
    const dx = (lt.end.x - lt.start.x) / (count - 1);
    const dy = (lt.end.y - lt.start.y) / (count - 1);

    const { building, floor } = openPlanOf(st);
    const mint = idMinter(st.nodes);

    const created: MapNode[] = [];
    for (let i = 0; i < count; i++) {
      let x = Math.round(lt.start.x + dx * i);
      let y = Math.round(lt.start.y + dy * i);

      if (st.gridSettings.enabled && st.gridSettings.snap) {
        x = Math.round(x / st.gridSettings.size) * st.gridSettings.size;
        y = Math.round(y / st.gridSettings.size) * st.gridSettings.size;
      }

      created.push({
        id: mint(null, { building, floor }),
        x,
        y,
        building,
        floor,
        isPortal: false,
        neighbors: [],
      });
    }

    if (lt.autoConnect && created.length > 1) {
      for (let i = 0; i < created.length; i++) {
        if (i > 0) created[i].neighbors.push(created[i - 1].id);
        if (i + 1 < created.length) created[i].neighbors.push(created[i + 1].id);
      }
    }

    useHistoryStore.getState().push({
      type: 'BATCH',
      description: `Ряд точек: ${nodesCount(created.length)}`,
      undoData: { kind: 'line', nodeIds: created.map((n) => n.id) },
      redoData: { kind: 'line', nodes: created },
    });

    set((s) => {
      for (const n of created) {
        s.nodes.set(n.id, { ...n, neighbors: [...n.neighbors] });
      }
      s.selectedNodeIds = new Set([created[created.length - 1].id]);
      s.lineTool.start = null;
      s.lineTool.end = null;
    });
  },
});
