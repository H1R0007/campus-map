import { CAMPUS_BUILDING_ID, CAMPUS_FLOOR } from '@campus-map/core';
import type { MapNode, TransitionType } from '@campus-map/core';
import { useHistoryStore } from '../historyStore';
import type { NeighborSnapshot, NodePosition } from '../historyStore';
import { autoFixDataset } from '../../utils/autoFix';
import type { AutoFixReport } from '../../utils/autoFix';
import { TRANSITION_LABELS, nodesCount } from '../../utils/labels';
import { snapshotNeighbors } from './graphState';
import type { EditorSlice } from './types';

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

  generateNodeId: () => string;
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
  setNodeAliases: (nodeId: string, names: string[]) => void;
  setNodeComment: (nodeId: string, comment: string) => void;

  splitEdge: (fromId: string, toId: string) => string | null;

  deleteSelected: () => void;
  duplicateSelected: () => void;
  moveSelectedBy: (dx: number, dy: number) => void;
  setSelectedPortal: (isPortal: boolean) => void;
  connectSelectedChain: () => void;

  copySelected: () => void;
  /** Вставляет копию на открытый план; без сдвига — на своё место или рядом. */
  paste: (offsetX?: number, offsetY?: number) => void;

  lineConfirm: () => void;

  autoFix: () => AutoFixReport;
}

export const createEditSlice: EditorSlice<EditSlice> = (set, get) => ({
  clipboard: null,

  generateNodeId: () => {
    const st = get();
    const building = st.currentBuilding ?? 'campus';
    const floor = st.currentFloor ?? 0;
    const counter = st.nodeIdCounter;
    set((s) => {
      s.nodeIdCounter = counter + 1;
    });
    return `${building.toLowerCase()}_${floor}_node_${counter}`;
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

    // Алиасы живут отдельно от узла, поэтому снимаются своим слепком.
    // Комментарий — поле самого узла и уходит вместе с `nodeSnapshot`.
    const aliasesSnapshot = [...(st.aliases.get(nodeId) ?? [])];

    useHistoryStore.getState().push({
      type: 'REMOVE_NODE',
      description: 'Удалён узел',
      undoData: {
        node: nodeSnapshot,
        neighborsBefore,
        transitionsBefore,
        aliases: aliasesSnapshot,
      },
      redoData: { nodeId },
    });

    set((s) => {
      for (const [, n] of s.nodes) {
        n.neighbors = n.neighbors.filter((x) => x !== nodeId);
      }
      s.transitions = s.transitions.filter((t) => t.fromNode !== nodeId && t.toNode !== nodeId);
      s.nodes.delete(nodeId);
      s.aliases.delete(nodeId);
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
    const counter = st.nodeIdCounter;
    const newId = `${building.toLowerCase()}_${floor}_node_${counter}`;

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
      s.nodeIdCounter = counter + 1;

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
    const { selectedNodeIds, nodes, transitions, aliases } = get();
    if (selectedNodeIds.size === 0) return;

    const ids = Array.from(selectedNodeIds);
    const deletedNodes: MapNode[] = [];
    const deletedAliases: { id: string; names: string[] }[] = [];
    const affected = new Set<string>();

    for (const id of ids) {
      const node = nodes.get(id);
      if (node) {
        deletedNodes.push({ ...node, neighbors: [...node.neighbors] });
        affected.add(id);
        for (const nb of node.neighbors) affected.add(nb);
      }

      const nodeAliases = aliases.get(id);
      if (nodeAliases && nodeAliases.length > 0) {
        deletedAliases.push({ id, names: [...nodeAliases] });
      }
    }

    useHistoryStore.getState().push({
      type: 'BATCH',
      description: `Удалено: ${nodesCount(ids.length)}`,
      undoData: {
        kind: 'deleteMultiple',
        nodes: deletedNodes,
        neighborsBefore: snapshotNeighbors(nodes, affected),
        transitionsBefore: [...transitions],
        aliases: deletedAliases,
      },
      redoData: { kind: 'deleteMultiple', nodeIds: ids },
    });

    set((s) => {
      for (const id of ids) {
        s.nodes.delete(id);
        s.aliases.delete(id);
      }
      for (const [, n] of s.nodes) {
        n.neighbors = n.neighbors.filter((nb) => !ids.includes(nb));
      }
      s.transitions = s.transitions.filter((t) => !ids.includes(t.fromNode) && !ids.includes(t.toNode));
      s.selectedNodeIds = new Set();
    });
  },

  duplicateSelected: () => {
    const { selectedNodeIds, nodes, currentBuilding, currentFloor } = get();
    if (selectedNodeIds.size === 0) return;

    const ids = Array.from(selectedNodeIds);
    const offset = 30;

    const oldToNew = new Map<string, string>();
    const newNodes: MapNode[] = [];

    let counter = get().nodeIdCounter;
    const building = currentBuilding ?? 'campus';
    const floor = currentFloor ?? 0;

    for (const id of ids) {
      const node = nodes.get(id);
      if (!node) continue;

      const newId = `${building.toLowerCase()}_${floor}_node_${counter++}`;
      oldToNew.set(id, newId);

      newNodes.push({
        id: newId,
        x: node.x + offset,
        y: node.y + offset,
        building: node.building,
        floor: node.floor,
        isPortal: node.isPortal,
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
      s.nodeIdCounter = counter;
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

  setSelectedPortal: (isPortal) => {
    const { selectedNodeIds, nodes } = get();
    if (selectedNodeIds.size === 0) return;

    const ids = Array.from(selectedNodeIds);
    const before: { nodeId: string; isPortal: boolean }[] = [];
    for (const id of ids) {
      const node = nodes.get(id);
      if (node) before.push({ nodeId: id, isPortal: node.isPortal });
    }

    useHistoryStore.getState().push({
      type: 'BATCH',
      description: 'Изменён флаг портала',
      undoData: { kind: 'setPortal', changes: before },
      redoData: { kind: 'setPortal', nodeIds: ids, isPortal },
    });

    set((s) => {
      for (const id of ids) {
        const node = s.nodes.get(id);
        if (node) node.isPortal = isPortal;
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

    let counter = get().nodeIdCounter;

    for (const node of clipboard.nodes) {
      const newId = `${building.toLowerCase()}_${floor}_node_${counter++}`;
      oldToNew.set(node.id, newId);

      newNodes.push({
        id: newId,
        x: node.x + shiftX,
        y: node.y + shiftY,
        building,
        floor,
        isPortal: node.isPortal,
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
      s.nodeIdCounter = counter;
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
    const currentCounter = st.nodeIdCounter;
    const buildingLower = building.toLowerCase();

    const created: MapNode[] = [];
    for (let i = 0; i < count; i++) {
      let x = Math.round(lt.start.x + dx * i);
      let y = Math.round(lt.start.y + dy * i);

      if (st.gridSettings.enabled && st.gridSettings.snap) {
        x = Math.round(x / st.gridSettings.size) * st.gridSettings.size;
        y = Math.round(y / st.gridSettings.size) * st.gridSettings.size;
      }

      created.push({
        id: `${buildingLower}_${floor}_node_${currentCounter + i}`,
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
      s.nodeIdCounter = currentCounter + count;
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
      });
    }

    return report;
  },
});
