import type { Landmark, MapNode, PlaceCategory, PlaceKind, PointPhoto, TransitionType } from '@campus-map/core';
import { useHistoryStore } from '../historyStore';
import type { AliasSnapshot, NeighborSnapshot, NodePosition } from '../historyStore';
import { autoFixDataset } from '../../utils/autoFix';
import type { AutoFixReport } from '../../utils/autoFix';
import { TRANSITION_LABELS, nodesCount } from '../../utils/labels';
import { placeKindName } from '../../utils/placeKinds';
import { nodeIdForKind, nodeIdProblem } from '../../utils/nodeIds';
import { snapshotNeighbors, syncPortals } from './graphState';
import { forgetPlace, renameNodeEverywhere, snapshotPlace } from './historyApply';
import type { EditorSlice } from './types';
import { openPlanOf } from './placement';


/** За сколько миллисекунд подряд идущие сдвиги стрелками сливаются в одну запись отмены. */
const MOVE_MERGE_MS = 900;

/** Чем закончилась попытка создать переход. */
export type AddTransitionResult = 'created' | 'samePlan' | 'exists' | 'missing';


/**
 * Правка графа: узлы, рёбра, переходы, алиасы и заметки, групповые действия,
 * автоисправление. Постановка по видам — `kindSlice`, буфер обмена —
 * `clipboardSlice`, общее у них — `placement`.
 *
 * Каждое действие, которое меняет данные, кладёт запись в историю отмены
 * (`historyStore`) до того, как изменить состояние.
 */
export interface EditSlice {

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
  setNodeAliases: (nodeId: string, names: string[]) => void;
  /** Вид места: туалет, еда, гардероб, выход — или ничего. */
  setNodeCategory: (nodeId: string, category: PlaceCategory | null) => void;

  /**
   * Заменяет каталог видов точек целиком: так пишутся и создание вида, и
   * правка, и удаление, и порядок.
   */
  setPlaceKinds: (kinds: PlaceKind[], description: string) => void;
  setNodeComment: (nodeId: string, comment: string) => void;
  /** Ориентир точки (запись 87); `null` — снять. */
  setNodeLandmark: (nodeId: string, landmark: Landmark | null) => void;
  /** Фото точки по порядку, первое — главное (запись 87). */
  setNodePhotos: (nodeId: string, photos: PointPhoto[]) => void;

  splitEdge: (fromId: string, toId: string) => string | null;

  deleteSelected: () => void;
  moveSelectedBy: (dx: number, dy: number) => void;
  connectSelectedChain: () => void;



  autoFix: () => AutoFixReport;
}


export const createEditSlice: EditorSlice<EditSlice> = (set, get) => ({

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
    const { building, floor } = openPlanOf(st);

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
      description: 'Добавлена точка',
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
      description: 'Удалена точка',
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
      description: 'Перемещение точки',
      undoData: { nodeId, x: fromX, y: fromY },
      redoData: { nodeId, x: toX, y: toY },
    });
  },

  // Кадр перетаскивания — мимо immer: черновик Map он собирает копированием
  // всех записей с проверками, и на кампусе в 13 000 точек это было заметной
  // частью каждого кадра. Здесь — простая копия Map и новые объекты только
  // сдвинутых точек; остальные точки те же, и их слои не перерисовываются.
  setNodePositions: (positions) => {
    const nodes = new Map(get().nodes);
    for (const pos of positions) {
      const n = nodes.get(pos.nodeId);
      if (n) nodes.set(pos.nodeId, { ...n, x: pos.x, y: pos.y });
    }
    set({ nodes });
  },

  commitNodePositions: (before, after) => {
    const moved = after.filter((pos, i) => pos.x !== before[i]?.x || pos.y !== before[i]?.y);
    if (moved.length === 0) return;

    const history = useHistoryStore.getState();
    if (after.length === 1) {
      history.push({
        type: 'MOVE_NODE',
        description: 'Перемещение точки',
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
      description: 'Изменение точки',
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

  /**
   * Ориентир — поле самого узла, как заметка: та же запись истории
   * `UPDATE_NODE`, отдельной ветки отмены не нужно.
   */
  setNodeLandmark: (nodeId, landmark) => {
    const node = get().nodes.get(nodeId);
    if (!node) return;
    const prev = node.landmark;
    if (JSON.stringify(prev ?? null) === JSON.stringify(landmark)) return;

    useHistoryStore.getState().push({
      type: 'UPDATE_NODE',
      description: landmark === null ? 'Ориентир снят' : prev ? 'Изменён ориентир' : 'Добавлен ориентир',
      undoData: { nodeId, updates: { landmark: prev ? structuredClone(prev) : undefined } },
      redoData: { nodeId, updates: { landmark: landmark ? structuredClone(landmark) : undefined } },
    });

    set((s) => {
      const n = s.nodes.get(nodeId);
      if (!n) return;
      if (landmark) n.landmark = structuredClone(landmark);
      else delete n.landmark;
    });
  },

  setNodePhotos: (nodeId, photos) => {
    const node = get().nodes.get(nodeId);
    if (!node) return;
    const prev = node.photos ?? [];
    if (JSON.stringify(prev) === JSON.stringify(photos)) return;

    useHistoryStore.getState().push({
      type: 'UPDATE_NODE',
      description: photos.length > prev.length ? 'Добавлено фото' : photos.length < prev.length ? 'Удалено фото' : 'Изменён порядок фото',
      undoData: { nodeId, updates: { photos: prev.length > 0 ? prev.map((photo) => ({ ...photo })) : undefined } },
      redoData: { nodeId, updates: { photos: photos.length > 0 ? photos.map((photo) => ({ ...photo })) : undefined } },
    });

    set((s) => {
      const n = s.nodes.get(nodeId);
      if (!n) return;
      if (photos.length > 0) n.photos = photos.map((photo) => ({ ...photo }));
      else delete n.photos;
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
      description: 'Точка вставлена в связь',
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
