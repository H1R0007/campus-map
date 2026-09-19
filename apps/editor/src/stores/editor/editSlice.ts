import { CAMPUS_BUILDING_ID, CAMPUS_FLOOR, distance } from '@campus-map/core';
import type { MapNode, PlaceCategory, PlaceKind, Transition, TransitionType } from '@campus-map/core';
import { useHistoryStore } from '../historyStore';
import type { AliasSnapshot, NeighborSnapshot, NodePosition } from '../historyStore';
import { autoFixDataset } from '../../utils/autoFix';
import type { AutoFixReport } from '../../utils/autoFix';
import { TRANSITION_LABELS, nodesCount, plural } from '../../utils/labels';
import { kindNameTemplate, placeKindName, visibleKinds } from '../../utils/placeKinds';
import { nodeIdForKind, nodeIdProblem, planPrefix, rebaseNodeId, uniqueNodeId } from '../../utils/nodeIds';
import { snapToNeighbours } from '../../utils/snapping';
import type { SnapResult } from '../../utils/snapping';
import { useCursorStore } from '../cursorStore';
import { floorNodesOf } from './dataSlice';
import { snapshotNeighbors, syncPortals } from './graphState';
import { forgetPlace, renameNodeEverywhere, snapshotPlace } from './historyApply';
import type { EditorSlice, EditorStore } from './types';

/** План, на котором окажется точка: у территории оба поля `null`. */
interface PlanRef {
  building: string | null;
  floor: number | null;
}

/** Сдвиг вставки на том же плане, пиксели: копия не ложится точно на оригинал. */
const PASTE_OFFSET = 20;

/** За сколько миллисекунд подряд идущие сдвиги стрелками сливаются в одну запись отмены. */
const MOVE_MERGE_MS = 900;

/** Чем закончилась попытка создать переход. */
export type AddTransitionResult = 'created' | 'samePlan' | 'exists' | 'missing';

export interface ClipboardData {
  nodes: MapNode[];
  internalEdges: { from: string; to: string }[];
}

/**
 * Правка графа: узлы, рёбра, переходы, алиасы и заметки, групповые действия,
 * буфер обмена, автоисправление и выгрузка.
 *
 * Каждое действие, которое меняет данные, кладёт запись в историю отмены
 * (`historyStore`) до того, как изменить состояние.
 */
export interface EditSlice {
  clipboard: ClipboardData | null;

  generateNodeId: (kind?: PlaceKind | null) => string;
  addNode: (x: number, y: number) => string;
  removeNode: (nodeId: string) => void;
  moveNode: (nodeId: string, x: number, y: number) => void;
  commitMoveNode: (nodeId: string, fromX: number, fromY: number, toX: number, toY: number) => void;
  /** Ставит узлы в точки без записи в историю — кадр перетаскивания. */
  setNodePositions: (positions: readonly NodePosition[]) => void;
  /**
   * Одна запись истории на всё перетаскивание: узлы уже стоят в `after`
   * (`setNodePositions`), отмена вернёт их в `before`.
   */
  commitNodePositions: (before: readonly NodePosition[], after: readonly NodePosition[]) => void;
  updateNode: (nodeId: string, updates: Partial<MapNode>) => void;
  /**
   * Меняет id точки, чиня ссылки на неё: связи, переходы, названия, вид места.
   *
   * @returns `true`, если переименование прошло; `false`, если новый id не
   *          годится — вызывающая сторона показывает причину человеку.
   */
  renameNode: (nodeId: string, nextId: string) => boolean;
  addEdge: (fromId: string, toId: string) => void;
  removeEdge: (fromId: string, toId: string) => void;
  /**
   * Создаёт переход между планами.
   *
   * @returns что получилось: переход создан либо почему нет — узлы на одном
   *          плане, переход уже есть, узла нет. Вызывающая сторона объясняет
   *          это человеку.
   */
  addTransition: (fromId: string, toId: string, type: TransitionType) => AddTransitionResult;
  removeTransition: (fromId: string, toId: string) => void;
  updateTransitionType: (fromId: string, toId: string, type: TransitionType) => void;
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
  setNodeAliases: (nodeId: string, names: string[]) => void;
  /** Вид места: туалет, еда, гардероб, выход — или ничего. */
  setNodeCategory: (nodeId: string, category: PlaceCategory | null) => void;

  /**
   * Заменяет каталог видов точек целиком: так пишутся и создание вида, и
   * правка, и удаление, и порядок.
   */
  setPlaceKinds: (kinds: PlaceKind[], description: string) => void;
  setNodeComment: (nodeId: string, comment: string) => void;

  splitEdge: (fromId: string, toId: string) => string | null;

  deleteSelected: () => void;
  duplicateSelected: () => void;
  moveSelectedBy: (dx: number, dy: number) => void;
  connectSelectedChain: () => void;

  copySelected: () => void;
  /** Вставляет копию на открытый план; без сдвига — на своё место или рядом. */
  paste: (offsetX?: number, offsetY?: number) => void;

  lineConfirm: () => void;

  autoFix: () => AutoFixReport;
}

/**
 * Точка с учётом выравнивания по соседям на плане.
 *
 * Считается там же, где ставится точка: подсказка на карте и сама
 * постановка обязаны совпадать до пикселя, иначе точка встанет не туда, куда
 * показывала линия выравнивания.
 */
/** Что нужно знать о плане, чтобы решить, куда встанет точка по щелчку. */
type PlacementState = Pick<
  EditorStore,
  'nodes' | 'currentBuilding' | 'currentFloor' | 'displayFilters' | 'gridSettings' | 'snapToGrid'
>;

/**
 * Куда встанет точка по щелчку: выравнивание по соседям, затем сетка.
 *
 * Одна функция на подсказку и на постановку: призрак на карте обязан
 * показывать ровно то место, куда точка встанет. Если сетка увела точку с
 * линии соседа, линия выравнивания не показывается — ряда уже нет.
 */
export function placementPoint(state: PlacementState, x: number, y: number, align = true): SnapResult {
  const aligned = alignToPlan(state, x, y, align);
  const px = Math.round(state.snapToGrid(aligned.x));
  const py = Math.round(state.snapToGrid(aligned.y));
  return {
    x: px,
    y: py,
    alignedX: aligned.alignedX && aligned.alignedX.x === px ? aligned.alignedX : null,
    alignedY: aligned.alignedY && aligned.alignedY.y === py ? aligned.alignedY : null,
  };
}

export function alignToPlan(
  state: Pick<EditorStore, 'nodes' | 'currentBuilding' | 'currentFloor' | 'displayFilters' | 'gridSettings'>,
  x: number,
  y: number,
  enabled = true
): SnapResult {
  if (!enabled || !state.gridSettings.alignToNeighbours) {
    return { x, y, alignedX: null, alignedY: null };
  }

  const scale = 2 ** (useCursorStore.getState().zoom ?? 0);
  const planNodes = floorNodesOf(state.nodes, state.currentBuilding, state.currentFloor, state.displayFilters.showPortals);
  return snapToNeighbours(planNodes, x, y, scale);
}

/**
 * Ближайшая точка того же плана — к ней кисть цепляет новую.
 *
 * Ищется по плану, а не по всему датасету: иначе дверь цеплялась бы к точке
 * этажом выше, и маршрут проходил бы сквозь перекрытие.
 */
function nearestNodeOnPlan(nodes: Map<string, MapNode>, node: MapNode): MapNode | null {
  let best: MapNode | null = null;
  let bestAway = Number.POSITIVE_INFINITY;

  for (const other of nodes.values()) {
    if (other.id === node.id || other.building !== node.building || other.floor !== node.floor) continue;
    const away = distance(node, other);
    if (away < bestAway) {
      best = other;
      bestAway = away;
    }
  }

  return best;
}

/**
 * Раздаёт id новым точкам набора.
 *
 * Пока набор не положен в состояние, `nodes` о нём не знает, поэтому занятость
 * проверяется и по уже выданным id: иначе две копии подряд получили бы один id
 * и вторая затёрла бы первую.
 */
function idMinter(nodes: Map<string, MapNode>) {
  const used = new Set<string>();
  /** `source` — точка, с которой снята копия, или `null` у точки без прошлого. */
  return (source: Pick<MapNode, 'id' | 'building' | 'floor'> | null, to: PlanRef): string => {
    const toPrefix = planPrefix(to.building, to.floor);
    const base =
      source === null ? `${toPrefix}_node` : rebaseNodeId(source.id, planPrefix(source.building, source.floor), toPrefix);
    const id = uniqueNodeId(base, (candidate) => nodes.has(candidate) || used.has(candidate));
    used.add(id);
    return id;
  };
}

/**
 * Переходы, которые ставятся стопкой — сразу на всех этажах корпуса. Лестницы
 * и лифты на планах стоят друг под другом. Вход и переход между корпусами
 * соединяют разные места, их владелец просил ставить руками.
 */
export const STACK_TRANSITIONS: readonly TransitionType[] = ['stairs', 'lift'];

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
}

type StoreSet = Parameters<EditorSlice<EditSlice>>[0];
type StoreGet = Parameters<EditorSlice<EditSlice>>[1];

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

  // Переходы между соседними этажами стопки.
  const newTransitions: Transition[] = [];
  if (spec.transition !== null) {
    for (let i = 0; i + 1 < created.length; i += 1) {
      newTransitions.push({ fromNode: created[i].id, toNode: created[i + 1].id, type: spec.transition });
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

export const createEditSlice: EditorSlice<EditSlice> = (set, get) => ({
  clipboard: null,

  generateNodeId: (kind = null) => {
    const st = get();
    return nodeIdForKind(kind, st.currentBuilding, st.currentFloor, (id) => st.nodes.has(id));
  },

  addNode: (x, y) => {
    const st = get();
    const { gridSettings } = st;

    let finalX = Math.round(x);
    let finalY = Math.round(y);

    if (gridSettings.enabled && gridSettings.snap) {
      finalX = Math.round(x / gridSettings.size) * gridSettings.size;
      finalY = Math.round(y / gridSettings.size) * gridSettings.size;
    }

    const id = st.generateNodeId();
    const building = st.currentBuilding ?? CAMPUS_BUILDING_ID;
    const floor = st.currentFloor ?? CAMPUS_FLOOR;

    const node: MapNode = {
      id,
      x: finalX,
      y: finalY,
      building,
      floor,
      isPortal: false,
      neighbors: [],
    };

    useHistoryStore.getState().push({
      type: 'ADD_NODE',
      description: 'Добавлен узел',
      undoData: { nodeId: id },
      redoData: { node },
    });

    set((s) => {
      s.nodes.set(id, node);
      s.selectedNodeIds = new Set([id]);
    });

    return id;
  },

  removeNode: (nodeId) => {
    const st = get();
    const node = st.nodes.get(nodeId);
    if (!node) return;

    const affected = new Set<string>([nodeId]);
    for (const [id, n] of st.nodes) {
      if (n.neighbors.includes(nodeId)) affected.add(id);
    }
    for (const nb of node.neighbors) affected.add(nb);

    const neighborsBefore = snapshotNeighbors(st.nodes, affected);
    const transitionsBefore = [...st.transitions];
    const nodeSnapshot: MapNode = { ...node, neighbors: [...node.neighbors] };

    // Названия, перевод и вид места живут отдельно от узла, поэтому снимаются
    // своим слепком. Комментарий — поле самого узла и уходит с `nodeSnapshot`.
    const place = snapshotPlace(st, nodeId);

    useHistoryStore.getState().push({
      type: 'REMOVE_NODE',
      description: 'Удалён узел',
      undoData: {
        node: nodeSnapshot,
        neighborsBefore,
        transitionsBefore,
        place,
      },
      redoData: { nodeId },
    });

    set((s) => {
      for (const [, n] of s.nodes) {
        n.neighbors = n.neighbors.filter((x) => x !== nodeId);
      }
      s.transitions = s.transitions.filter((t) => t.fromNode !== nodeId && t.toNode !== nodeId);
      s.nodes.delete(nodeId);
      forgetPlace(s, nodeId);
      syncPortals(s);
      s.selectedNodeIds.delete(nodeId);
      s.edgeStartNodeId = null;
      s.transitionStartNodeId = null;
    });
  },

  moveNode: (nodeId, x, y) =>
    set((s) => {
      const n = s.nodes.get(nodeId);
      if (!n) return;

      let finalX = Math.round(x);
      let finalY = Math.round(y);

      if (s.gridSettings.enabled && s.gridSettings.snap) {
        finalX = Math.round(x / s.gridSettings.size) * s.gridSettings.size;
        finalY = Math.round(y / s.gridSettings.size) * s.gridSettings.size;
      }

      n.x = finalX;
      n.y = finalY;
    }),

  commitMoveNode: (nodeId, fromX, fromY, toX, toY) => {
    if (fromX === toX && fromY === toY) return;

    useHistoryStore.getState().push({
      type: 'MOVE_NODE',
      description: 'Перемещение узла',
      undoData: { nodeId, x: fromX, y: fromY },
      redoData: { nodeId, x: toX, y: toY },
    });
  },

  setNodePositions: (positions) =>
    set((s) => {
      for (const pos of positions) {
        const n = s.nodes.get(pos.nodeId);
        if (n) {
          n.x = pos.x;
          n.y = pos.y;
        }
      }
    }),

  commitNodePositions: (before, after) => {
    const moved = after.filter((pos, i) => pos.x !== before[i]?.x || pos.y !== before[i]?.y);
    if (moved.length === 0) return;

    const history = useHistoryStore.getState();
    if (after.length === 1) {
      history.push({
        type: 'MOVE_NODE',
        description: 'Перемещение узла',
        undoData: { ...before[0] },
        redoData: { ...after[0] },
      });
    } else {
      history.push({
        type: 'BATCH',
        description: `Перемещено: ${nodesCount(after.length)}`,
        undoData: { kind: 'moveMultiple', positions: before.map((p) => ({ ...p })) },
        redoData: { kind: 'moveMultiple', positions: after.map((p) => ({ ...p })) },
      });
    }
  },

  updateNode: (nodeId, updates) => {
    const node = get().nodes.get(nodeId);
    if (!node) return;

    const prev: Partial<MapNode> = {};
    for (const key of Object.keys(updates) as (keyof MapNode)[]) {
      // Присваивание по вычисляемому ключу: TypeScript теряет связь между
      // ключом и типом значения, поэтому `prev[key] = node[key]` без
      // приведения не проходит, а `Object.assign` обходится без него.
      Object.assign(prev, { [key]: node[key] });
    }

    useHistoryStore.getState().push({
      type: 'UPDATE_NODE',
      description: 'Изменение узла',
      undoData: { nodeId, updates: prev },
      redoData: { nodeId, updates },
    });

    set((s) => {
      const n = s.nodes.get(nodeId);
      if (!n) return;
      Object.assign(n, updates);
    });
  },

  renameNode: (nodeId, nextId) => {
    const st = get();
    const to = nextId.trim();
    if (!st.nodes.has(nodeId) || to === nodeId) return false;
    if (nodeIdProblem(to, (id) => st.nodes.has(id), nodeId) !== null) return false;

    useHistoryStore.getState().push({
      type: 'RENAME_NODE',
      description: `id точки: ${nodeId} → ${to}`,
      undoData: { from: nodeId, to },
      redoData: { from: nodeId, to },
    });

    set((s) => {
      renameNodeEverywhere(s, nodeId, to);
    });

    return true;
  },

  addEdge: (fromId, toId) => {
    if (fromId === toId) return;
    const st = get();
    const a = st.nodes.get(fromId);
    const b = st.nodes.get(toId);
    if (!a || !b) return;
    if (a.neighbors.includes(toId)) return;

    useHistoryStore.getState().push({
      type: 'ADD_EDGE',
      description: 'Добавлена связь',
      // `neighborsBefore` уже содержит оба узла как ключи, поэтому
      // отдельный список id был бы избыточным дублем в каждой записи.
      undoData: { neighborsBefore: snapshotNeighbors(st.nodes, [fromId, toId]) },
      redoData: { fromId, toId },
    });

    set((s) => {
      const aa = s.nodes.get(fromId);
      const bb = s.nodes.get(toId);
      if (!aa || !bb) return;
      if (!aa.neighbors.includes(toId)) aa.neighbors.push(toId);
      if (!bb.neighbors.includes(fromId)) bb.neighbors.push(fromId);
    });
  },

  removeEdge: (fromId, toId) => {
    const st = get();

    useHistoryStore.getState().push({
      type: 'REMOVE_EDGE',
      description: 'Удалена связь',
      undoData: { neighborsBefore: snapshotNeighbors(st.nodes, [fromId, toId]) },
      redoData: { fromId, toId },
    });

    set((s) => {
      const aa = s.nodes.get(fromId);
      const bb = s.nodes.get(toId);
      if (aa) aa.neighbors = aa.neighbors.filter((x) => x !== toId);
      if (bb) bb.neighbors = bb.neighbors.filter((x) => x !== fromId);
    });
  },

  addTransition: (fromId, toId, type) => {
    const st = get();
    const from = st.nodes.get(fromId);
    const to = st.nodes.get(toId);
    if (fromId === toId || !from || !to) return 'missing';

    // Переход связывает планы. Два узла одного плана соединяются ребром, а
    // переход между ними навигатор провёл бы «сквозь этаж».
    if (from.building === to.building && from.floor === to.floor) return 'samePlan';

    const exists = st.transitions.some(
      (t) => (t.fromNode === fromId && t.toNode === toId) || (t.fromNode === toId && t.toNode === fromId)
    );
    if (exists) return 'exists';

    const before = [...st.transitions];
    const next = [...st.transitions, { fromNode: fromId, toNode: toId, type }];

    useHistoryStore.getState().push({
      type: 'ADD_TRANSITION',
      description: `Добавлен переход: ${TRANSITION_LABELS[type].toLowerCase()}`,
      undoData: { transitions: before },
      redoData: { transitions: next },
    });

    set((s) => {
      s.transitions = next;
      syncPortals(s);
    });

    return 'created';
  },

  removeTransition: (fromId, toId) => {
    const st = get();
    const before = [...st.transitions];
    const next = st.transitions.filter(
      (t) => !((t.fromNode === fromId && t.toNode === toId) || (t.fromNode === toId && t.toNode === fromId))
    );
    if (next.length === before.length) return;

    useHistoryStore.getState().push({
      type: 'REMOVE_TRANSITION',
      description: 'Удалён переход',
      undoData: { transitions: before },
      redoData: { transitions: next },
    });

    set((s) => {
      s.transitions = next;
      syncPortals(s);
    });
  },

  updateTransitionType: (fromId, toId, type) => {
    const st = get();
    const index = st.transitions.findIndex(
      (t) => (t.fromNode === fromId && t.toNode === toId) || (t.fromNode === toId && t.toNode === fromId)
    );
    if (index < 0 || st.transitions[index].type === type) return;

    const before = [...st.transitions];
    const next = before.map((t, i) => (i === index ? { ...t, type } : t));

    useHistoryStore.getState().push({
      type: 'UPDATE_TRANSITION',
      description: 'Изменён тип перехода',
      undoData: { transitions: before },
      redoData: { transitions: next },
    });

    set((s) => {
      s.transitions = next;
      syncPortals(s);
    });
  },

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

  setNodeAliases: (nodeId, names) => {
    const prev = get().aliases.get(nodeId) ?? [];
    const next = names.map((x) => x.trim()).filter((x) => x.length > 0);
    if (prev.join('\n') === next.join('\n')) return;

    useHistoryStore.getState().push({
      type: 'SET_ALIASES',
      description: 'Изменены алиасы',
      undoData: { nodeId, names: [...prev] },
      redoData: { nodeId, names: [...next] },
    });

    set((s) => {
      // Пустой список — отсутствие записи, как после отмены и повтора.
      if (next.length > 0) s.aliases.set(nodeId, next);
      else s.aliases.delete(nodeId);
    });
  },

  /**
   * Каталог видов точек.
   *
   * Виды — данные разметки: они уходят в `place-kinds.json` рядом с узлами и
   * названиями, поэтому правка каталога отменяется, как любая другая правка.
   * Пока каталог пуст, редактор показывает встроенные виды; первая же правка
   * записывает их целиком — дальше видно, что именно лежит в данных.
   */
  setPlaceKinds: (kinds, description) => {
    // Пустой каталог в состоянии означает «файла нет — показываем встроенные
    // виды». Удалить последний вид значило бы показать встроенные, а на диске
    // оставить прежний каталог: сохранение пустой каталог не пишет.
    if (kinds.length === 0) return;

    const before = get().placeKinds;
    const after = kinds.map((kind) => ({ ...kind }));
    if (JSON.stringify(before) === JSON.stringify(after)) return;

    useHistoryStore.getState().push({
      type: 'SET_PLACE_KINDS',
      description,
      undoData: { kinds: before.map((kind) => ({ ...kind })) },
      redoData: { kinds: after.map((kind) => ({ ...kind })) },
    });

    set((s) => {
      s.placeKinds = after;
    });
  },

  /**
   * Вид места — то, по чему навигатор показывает быстрые кнопки «ближайший
   * туалет», «где поесть» и значок на карточке места.
   *
   * Хранится в записи названий (`aliases.json`), и ядро признаёт вид только у
   * места с названием. Редактор до сих пор умел лишь сохранять то, что
   * вписано в файл руками: размеченный в редакторе туалет быстрая кнопка
   * навигатора не находила.
   */
  setNodeCategory: (nodeId, category) => {
    const previous = get().aliasCategories.get(nodeId) ?? null;
    if (previous === category) return;

    useHistoryStore.getState().push({
      type: 'SET_CATEGORY',
      description: category === null ? 'Снят вид места' : `Вид места: ${placeKindName(get().placeKinds, category).toLowerCase()}`,
      undoData: { nodeId, category: previous },
      redoData: { nodeId, category },
    });

    set((s) => {
      if (category === null) s.aliasCategories.delete(nodeId);
      else s.aliasCategories.set(nodeId, category);
    });
  },

  /**
   * Рабочая заметка разметчика.
   *
   * Хранится в поле `comment` самого узла — том же, что описан в `MapNode`
   * ядра, читается загрузчиком и пишется экспортом. Отдельной карты
   * комментариев больше нет: два хранилища для одного значения означали,
   * что заметки из датасета терялись при открытии, а созданные в редакторе
   * не попадали в сохранённый архив.
   *
   * История использует существующий тип `UPDATE_NODE`, поэтому отдельной
   * ветки отмены для комментариев не требуется.
   */
  setNodeComment: (nodeId, comment) => {
    const node = get().nodes.get(nodeId);
    if (!node) return;

    const prev = node.comment ?? '';
    const next = comment.trim();
    if (prev === next) return;

    useHistoryStore.getState().push({
      type: 'UPDATE_NODE',
      description: 'Изменён комментарий',
      undoData: { nodeId, updates: { comment: prev || undefined } },
      redoData: { nodeId, updates: { comment: next || undefined } },
    });

    set((s) => {
      const n = s.nodes.get(nodeId);
      if (!n) return;
      if (next) n.comment = next;
      else delete n.comment;
    });
  },

  /** Разделить ребро пополам, вставив узел посередине. */
  splitEdge: (fromId, toId) => {
    const st = get();
    const fromNode = st.nodes.get(fromId);
    const toNode = st.nodes.get(toId);

    if (!fromNode || !toNode) return null;
    if (!fromNode.neighbors.includes(toId)) return null;

    let x = Math.round((fromNode.x + toNode.x) / 2);
    let y = Math.round((fromNode.y + toNode.y) / 2);

    const { gridSettings } = st;
    if (gridSettings.enabled && gridSettings.snap) {
      x = Math.round(x / gridSettings.size) * gridSettings.size;
      y = Math.round(y / gridSettings.size) * gridSettings.size;
    }

    const { building, floor } = fromNode;
    const newId = nodeIdForKind(null, building, floor, (id) => st.nodes.has(id));

    const newNode: MapNode = {
      id: newId,
      x,
      y,
      building,
      floor,
      isPortal: false,
      neighbors: [fromId, toId],
    };

    useHistoryStore.getState().push({
      type: 'BATCH',
      description: 'Узел вставлен в связь',
      undoData: {
        kind: 'splitEdge',
        newNodeId: newId,
        fromId,
        toId,
        neighborsBefore: snapshotNeighbors(st.nodes, [fromId, toId]),
      },
      redoData: { kind: 'splitEdge', newNode, fromId, toId },
    });

    set((s) => {
      const from = s.nodes.get(fromId)!;
      const to = s.nodes.get(toId)!;
      from.neighbors = from.neighbors.filter((n) => n !== toId);
      to.neighbors = to.neighbors.filter((n) => n !== fromId);

      s.nodes.set(newId, newNode);

      from.neighbors.push(newId);
      to.neighbors.push(newId);

      s.selectedNodeIds = new Set([newId]);
    });

    return newId;
  },


  deleteSelected: () => {
    const st = get();
    const { selectedNodeIds, nodes, transitions } = st;
    if (selectedNodeIds.size === 0) return;

    const ids = Array.from(selectedNodeIds);
    const deletedNodes: MapNode[] = [];
    const deletedPlaces: AliasSnapshot[] = [];
    const affected = new Set<string>();

    for (const id of ids) {
      const node = nodes.get(id);
      if (node) {
        deletedNodes.push({ ...node, neighbors: [...node.neighbors] });
        affected.add(id);
        for (const nb of node.neighbors) affected.add(nb);
      }

      const place = snapshotPlace(st, id);
      if (place) deletedPlaces.push(place);
    }

    useHistoryStore.getState().push({
      type: 'BATCH',
      description: `Удалено: ${nodesCount(ids.length)}`,
      undoData: {
        kind: 'deleteMultiple',
        nodes: deletedNodes,
        neighborsBefore: snapshotNeighbors(nodes, affected),
        transitionsBefore: [...transitions],
        aliases: deletedPlaces,
      },
      redoData: { kind: 'deleteMultiple', nodeIds: ids },
    });

    set((s) => {
      for (const id of ids) {
        s.nodes.delete(id);
        forgetPlace(s, id);
      }
      for (const [, n] of s.nodes) {
        n.neighbors = n.neighbors.filter((nb) => !ids.includes(nb));
      }
      s.transitions = s.transitions.filter((t) => !ids.includes(t.fromNode) && !ids.includes(t.toNode));
      syncPortals(s);
      s.selectedNodeIds = new Set();
    });
  },

  duplicateSelected: () => {
    const { selectedNodeIds, nodes } = get();
    if (selectedNodeIds.size === 0) return;

    const ids = Array.from(selectedNodeIds);
    const offset = 30;

    const oldToNew = new Map<string, string>();
    const newNodes: MapNode[] = [];

    const mint = idMinter(nodes);

    for (const id of ids) {
      const node = nodes.get(id);
      if (!node) continue;

      const newId = mint(node, node);
      oldToNew.set(id, newId);

      newNodes.push({
        id: newId,
        x: node.x + offset,
        y: node.y + offset,
        building: node.building,
        floor: node.floor,
        // Переходы не копируются, поэтому и точкой перехода копия не будет.
        isPortal: false,
        neighbors: [],
      });
    }

    for (const id of ids) {
      const node = nodes.get(id);
      if (!node) continue;
      const newNode = newNodes.find((n) => n.id === oldToNew.get(id))!;
      for (const nb of node.neighbors) {
        const mapped = oldToNew.get(nb);
        if (mapped) newNode.neighbors.push(mapped);
      }
    }

    useHistoryStore.getState().push({
      type: 'BATCH',
      description: `Дублировано: ${nodesCount(newNodes.length)}`,
      undoData: { kind: 'line', nodeIds: newNodes.map((n) => n.id) },
      redoData: { kind: 'line', nodes: newNodes },
    });

    set((s) => {
      for (const n of newNodes) {
        s.nodes.set(n.id, { ...n, neighbors: [...n.neighbors] });
      }
      s.selectedNodeIds = new Set(newNodes.map((n) => n.id));
    });
  },

  /**
   * Сдвигает выделенные узлы ровно на заданное число пикселей плана.
   *
   * К сетке результат не притягивается: шаг выбирает тот, кто зовёт (у
   * клавиш со включённой сеткой он равен клетке). Прежде сдвиг на пиксель с
   * сеткой в 20 пикселей округлялся обратно, и стрелки не двигали узел вовсе.
   *
   * Подряд идущие сдвиги одного и того же набора узлов сливаются в одну
   * запись отмены: пять нажатий стрелки — один шаг назад.
   */
  moveSelectedBy: (dx, dy) => {
    const { selectedNodeIds, nodes } = get();
    if (selectedNodeIds.size === 0) return;

    const ids = Array.from(selectedNodeIds);
    const before: NodePosition[] = [];
    const after: NodePosition[] = [];

    for (const id of ids) {
      const node = nodes.get(id);
      if (!node) continue;
      before.push({ nodeId: id, x: node.x, y: node.y });
      after.push({ nodeId: id, x: node.x + dx, y: node.y + dy });
    }
    if (after.length === 0) return;

    const history = useHistoryStore.getState();
    const last = history.entries[history.currentIndex];
    const continues =
      last !== undefined &&
      history.currentIndex === history.entries.length - 1 &&
      last.type === 'BATCH' &&
      last.undoData.kind === 'moveMultiple' &&
      last.redoData.kind === 'moveMultiple' &&
      Date.now() - last.timestamp < MOVE_MERGE_MS &&
      last.redoData.positions.length === after.length &&
      last.redoData.positions.every((p, i) => p.nodeId === after[i].nodeId && p.x === before[i].x && p.y === before[i].y);

    const entry = {
      type: 'BATCH',
      description: `Перемещено: ${nodesCount(after.length)}`,
      undoData: continues && last.undoData.kind === 'moveMultiple' ? last.undoData : { kind: 'moveMultiple' as const, positions: before },
      redoData: { kind: 'moveMultiple' as const, positions: after },
    } as const;

    if (continues) history.replaceLast(entry);
    else history.push(entry);

    set((s) => {
      for (const pos of after) {
        const node = s.nodes.get(pos.nodeId);
        if (node) {
          node.x = pos.x;
          node.y = pos.y;
        }
      }
    });
  },



  connectSelectedChain: () => {
    const { selectedNodeIds, nodes } = get();
    if (selectedNodeIds.size < 2) return;

    const ids = Array.from(selectedNodeIds);
    const nodeList = ids.map((id) => nodes.get(id)).filter((n): n is MapNode => n !== undefined);
    nodeList.sort((a, b) => a.x - b.x || a.y - b.y);

    useHistoryStore.getState().push({
      type: 'BATCH',
      description: `Соединено цепочкой: ${nodesCount(nodeList.length)}`,
      undoData: { kind: 'chainConnect', neighborsBefore: snapshotNeighbors(nodes, ids) },
      redoData: { kind: 'chainConnect', nodeIds: nodeList.map((n) => n.id) },
    });

    set((s) => {
      for (let i = 0; i < nodeList.length - 1; i++) {
        const a = s.nodes.get(nodeList[i].id);
        const b = s.nodes.get(nodeList[i + 1].id);
        if (a && b) {
          if (!a.neighbors.includes(b.id)) a.neighbors.push(b.id);
          if (!b.neighbors.includes(a.id)) b.neighbors.push(a.id);
        }
      }
    });
  },

  copySelected: () => {
    const { selectedNodeIds, nodes } = get();
    if (selectedNodeIds.size === 0) return;

    const ids = Array.from(selectedNodeIds);
    const copiedNodes: MapNode[] = [];
    const internalEdges: { from: string; to: string }[] = [];

    for (const id of ids) {
      const node = nodes.get(id);
      if (!node) continue;
      copiedNodes.push({ ...node, neighbors: [...node.neighbors] });
      for (const nb of node.neighbors) {
        if (ids.includes(nb) && id < nb) internalEdges.push({ from: id, to: nb });
      }
    }

    set((s) => {
      s.clipboard = { nodes: copiedNodes, internalEdges };
    });
  },

  /**
   * Вставляет скопированное на открытый план.
   *
   * Без явного сдвига копия ложится: на том же плане — рядом с оригиналом,
   * на другом — в те же координаты, чтобы переносить коридор с этажа на этаж.
   * Прежде узлы получали id открытого плана, но оставались в корпусе и на
   * этаже оригинала: на кампусе вставленного было не найти.
   */
  paste: (offsetX, offsetY) => {
    const { clipboard, currentBuilding, currentFloor } = get();
    if (!clipboard || clipboard.nodes.length === 0) return;

    const building = currentBuilding ?? CAMPUS_BUILDING_ID;
    const floor = currentFloor ?? CAMPUS_FLOOR;
    const samePlan = clipboard.nodes.every((n) => n.building === building && n.floor === floor);
    const shiftX = offsetX ?? (samePlan ? PASTE_OFFSET : 0);
    const shiftY = offsetY ?? (samePlan ? PASTE_OFFSET : 0);

    const oldToNew = new Map<string, string>();
    const newNodes: MapNode[] = [];

    const mint = idMinter(get().nodes);

    for (const node of clipboard.nodes) {
      const newId = mint(node, { building, floor });
      oldToNew.set(node.id, newId);

      newNodes.push({
        id: newId,
        x: node.x + shiftX,
        y: node.y + shiftY,
        building,
        floor,
        // Переходы не копируются, поэтому и точкой перехода копия не будет.
        isPortal: false,
        neighbors: [],
      });
    }

    for (const edge of clipboard.internalEdges) {
      const newFrom = oldToNew.get(edge.from);
      const newTo = oldToNew.get(edge.to);
      if (newFrom && newTo) {
        newNodes.find((n) => n.id === newFrom)!.neighbors.push(newTo);
        newNodes.find((n) => n.id === newTo)!.neighbors.push(newFrom);
      }
    }

    useHistoryStore.getState().push({
      type: 'BATCH',
      description: `Вставлено: ${nodesCount(newNodes.length)}`,
      undoData: { kind: 'line', nodeIds: newNodes.map((n) => n.id) },
      redoData: { kind: 'line', nodes: newNodes },
    });

    set((s) => {
      for (const n of newNodes) {
        s.nodes.set(n.id, { ...n, neighbors: [...n.neighbors] });
      }
      s.selectedNodeIds = new Set(newNodes.map((n) => n.id));
    });
  },

  lineConfirm: () => {
    const st = get();
    const lt = st.lineTool;
    if (!lt.start || !lt.end) return;

    const count = Math.max(2, Math.min(50, lt.count));
    const dx = (lt.end.x - lt.start.x) / (count - 1);
    const dy = (lt.end.y - lt.start.y) / (count - 1);

    const building = st.currentBuilding ?? CAMPUS_BUILDING_ID;
    const floor = st.currentFloor ?? CAMPUS_FLOOR;
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
      description: `Линия: ${nodesCount(created.length)}`,
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

  autoFix: () => {
    const st = get();
    const neighborsBefore: NeighborSnapshot = {};
    for (const [id, node] of st.nodes) {
      neighborsBefore[id] = [...node.neighbors];
    }
    const transitionsBefore = [...st.transitions];

    const { fixedNodesNeighbors, fixedTransitions, fixedCoordinates, report } = autoFixDataset({
      nodes: st.nodes,
      transitions: st.transitions,
    });

    // Записей об исправлениях может быть больше, чем обрабатывает применение:
    // считается общее число, иначе часть найденного чинилась бы «на словах».
    if (report.totalFixes > 0) {
      const positionsBefore: NodePosition[] = [...fixedCoordinates.keys()].flatMap((id) => {
        const node = st.nodes.get(id);
        return node ? [{ nodeId: id, x: node.x, y: node.y }] : [];
      });

      useHistoryStore.getState().push({
        type: 'BATCH',
        description: 'Исправление данных',
        undoData: { kind: 'autofix', neighborsBefore, transitionsBefore, positionsBefore },
        redoData: {
          kind: 'autofix',
          fixedNodesNeighbors: Object.fromEntries(fixedNodesNeighbors),
          fixedTransitions,
          fixedCoordinates: Object.fromEntries(fixedCoordinates),
        },
      });

      set((s) => {
        for (const [id, neighbors] of fixedNodesNeighbors) {
          const node = s.nodes.get(id);
          if (node) node.neighbors = neighbors;
        }
        for (const [id, position] of fixedCoordinates) {
          const node = s.nodes.get(id);
          if (node) {
            node.x = position.x;
            node.y = position.y;
          }
        }
        s.transitions = fixedTransitions;
        syncPortals(s);
      });
    }

    return report;
  },
});
