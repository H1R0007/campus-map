import { create } from 'zustand';
import type { AliasEntry, BuildingMeta, CampusMeta, MapNode, PlaceCategory, PlaceKind, Transition } from '@campus-map/core';

/**
 * Контракт истории действий редактора и сам стек отмены.
 *
 * Каждая запись описывает, как отменить и как повторить действие. Полезные
 * нагрузки типизированы исчерпывающим объединением с дискриминантом: раньше
 * они хранились как `unknown`, и обе ветки применения разбирали их через
 * `as any` — семнадцать приведений, из-за которых опечатка в имени поля
 * обнаруживалась только в браузере, уже сломав отмену.
 */

/** Слепок списков соседей: id узла → его соседи до изменения. */
export type NeighborSnapshot = Record<string, string[]>;

/** Позиция узла — для группового перемещения. */
export interface NodePosition {
  nodeId: string;
  x: number;
  y: number;
}

/**
 * Слепок того, что о точке хранится отдельно от неё самой: названия, их
 * переводы и вид места.
 *
 * Удаление уносит всё это вместе с точкой, отмена возвращает. Иначе новая
 * точка, получившая освободившийся id, унаследовала бы чужой перевод и вид
 * места, а отмена её постановки стёрла бы вид места удалённой.
 */
export interface AliasSnapshot {
  id: string;
  names: string[];
  category?: PlaceCategory;
  translations?: NonNullable<AliasEntry['translations']>;
}

/**
 * Структура кампуса по одну сторону правки корпуса, этажа или плана.
 *
 * Корпуса, метаданные территории, планы и переходы хранятся целиком: их
 * немного, а правка структуры задевает их по-разному — удаление этажа уносит
 * переходы, смена номера двигает план. Точки и их названия — только
 * затронутые: `null` значит «точки нет».
 */
export interface StructureSide {
  buildingMetas: BuildingMeta[];
  campusMeta: CampusMeta | null;
  /** Планы: территория или этаж → ключ содержимого (`utils/planFiles.ts`). */
  planFiles: [string, string][];
  transitions: Transition[];
  nodes: [string, MapNode | null][];
  places: [string, AliasSnapshot | null][];
  /** Какой план был открыт: отмена и повтор возвращают к нему. */
  view: { building: string | null; floor: number | null };
}

/**
 * Нагрузки отмены для составных действий.
 *
 * Составное действие (`BATCH`) меняет сразу несколько сущностей, поэтому его
 * нагрузка различается по полю `kind`.
 */
export type BatchUndoPayload =
  | { kind: 'line'; nodeIds: string[] }
  | {
      kind: 'deleteMultiple';
      nodes: MapNode[];
      neighborsBefore: NeighborSnapshot;
      transitionsBefore: Transition[];
      aliases?: AliasSnapshot[];
    }
  | { kind: 'moveMultiple'; positions: NodePosition[] }
  | { kind: 'chainConnect'; neighborsBefore: NeighborSnapshot }
  | {
      kind: 'autofix';
      neighborsBefore: NeighborSnapshot;
      transitionsBefore: Transition[];
      /** Узлы с исправленными координатами — где они стояли до исправления. */
      positionsBefore: NodePosition[];
    }
  | {
      kind: 'splitEdge';
      newNodeId: string;
      fromId: string;
      toId: string;
      neighborsBefore: NeighborSnapshot;
    }
  | {
      /** Точка (или стопка точек), поставленная кистью вида. */
      kind: 'placeKind';
      nodeIds: string[];
      neighborsBefore: NeighborSnapshot;
      transitionsBefore: Transition[];
      /**
       * От какой точки шла линия и какая точка была поставлена последней до
       * щелчка: после отмены линия продолжается от предыдущей точки, а не
       * цепляется к ближайшей чужой.
       */
      chainBefore: string | null;
      lastPlacedBefore: string | null;
    };

/** Нагрузки повтора для составных действий. */
export type BatchRedoPayload =
  | { kind: 'line'; nodes: MapNode[] }
  | { kind: 'deleteMultiple'; nodeIds: string[] }
  | { kind: 'moveMultiple'; positions: NodePosition[] }
  | { kind: 'chainConnect'; nodeIds: string[] }
  | {
      kind: 'autofix';
      fixedNodesNeighbors: NeighborSnapshot;
      fixedTransitions: Transition[];
      fixedCoordinates: Record<string, { x: number; y: number }>;
    }
  | { kind: 'splitEdge'; newNode: MapNode; fromId: string; toId: string }
  | {
      kind: 'placeKind';
      nodes: MapNode[];
      neighbors: NeighborSnapshot;
      transitions: Transition[];
      /** Названия и виды мест, которые подставил вид точки. */
      aliases: AliasSnapshot[];
      categories: { id: string; category: PlaceCategory }[];
      chainAfter: string | null;
      lastPlacedAfter: string;
    };

/**
 * Запись истории.
 *
 * Объединение с дискриминантом по `type`: пара `undoData`/`redoData` для
 * каждого действия своя, и `switch (entry.type)` сужает обе сразу.
 */
export type HistoryEntry =
  | {
      type: 'ADD_NODE';
      description: string;
      timestamp: number;
      undoData: { nodeId: string };
      redoData: { node: MapNode };
    }
  | {
      type: 'REMOVE_NODE';
      description: string;
      timestamp: number;
      undoData: {
        node: MapNode;
        neighborsBefore: NeighborSnapshot;
        transitionsBefore: Transition[];
        /** Названия, перевод и вид места; `null`, если ничего этого не было. */
        place: AliasSnapshot | null;
      };
      redoData: { nodeId: string };
    }
  | {
      type: 'MOVE_NODE';
      description: string;
      timestamp: number;
      undoData: NodePosition;
      redoData: NodePosition;
    }
  | {
      type: 'UPDATE_NODE';
      description: string;
      timestamp: number;
      undoData: { nodeId: string; updates: Partial<MapNode> };
      redoData: { nodeId: string; updates: Partial<MapNode> };
    }
  | {
      type: 'ADD_EDGE';
      description: string;
      timestamp: number;
      undoData: { neighborsBefore: NeighborSnapshot };
      redoData: { fromId: string; toId: string };
    }
  | {
      type: 'REMOVE_EDGE';
      description: string;
      timestamp: number;
      undoData: { neighborsBefore: NeighborSnapshot };
      redoData: { fromId: string; toId: string };
    }
  | {
      type: 'ADD_TRANSITION';
      description: string;
      timestamp: number;
      undoData: { transitions: Transition[] };
      redoData: { transitions: Transition[] };
    }
  | {
      type: 'REMOVE_TRANSITION';
      description: string;
      timestamp: number;
      undoData: { transitions: Transition[] };
      redoData: { transitions: Transition[] };
    }
  | {
      type: 'UPDATE_TRANSITION';
      description: string;
      timestamp: number;
      undoData: { transitions: Transition[] };
      redoData: { transitions: Transition[] };
    }
  | {
      type: 'SET_ALIASES';
      description: string;
      timestamp: number;
      undoData: { nodeId: string; names: string[] };
      redoData: { nodeId: string; names: string[] };
    }
  | {
      type: 'SET_CATEGORY';
      description: string;
      timestamp: number;
      undoData: { nodeId: string; category: PlaceCategory | null };
      redoData: { nodeId: string; category: PlaceCategory | null };
    }
  | {
      /** Новый id точки: ссылки на неё чинятся по всему датасету. */
      type: 'RENAME_NODE';
      description: string;
      timestamp: number;
      undoData: { from: string; to: string };
      redoData: { from: string; to: string };
    }
  | {
      /** Корпус, этаж или план: добавлен, удалён, изменён (запись 47). */
      type: 'STRUCTURE';
      description: string;
      timestamp: number;
      undoData: StructureSide;
      redoData: StructureSide;
    }
  | {
      /** Каталог видов точек целиком: список короткий, а правки редкие. */
      type: 'SET_PLACE_KINDS';
      description: string;
      timestamp: number;
      undoData: { kinds: PlaceKind[] };
      redoData: { kinds: PlaceKind[] };
    }
  | {
      type: 'BATCH';
      description: string;
      timestamp: number;
      undoData: BatchUndoPayload;
      redoData: BatchRedoPayload;
    }
  | {
      /**
       * Правки одной панели — карточки точки, окна видов — одной записью.
       * Человек мог передумать несколько раз, а отмена возвращает всё, что
       * он сделал в панели, разом. Отмена — записи в обратном порядке,
       * повтор — в прямом.
       */
      type: 'GROUP';
      description: string;
      timestamp: number;
      undoData: { entries: HistoryEntry[] };
      redoData: { entries: HistoryEntry[] };
    };

/**
 * `Omit`, распределённый по членам объединения.
 *
 * Обычный `Omit<HistoryEntry, 'timestamp'>` схлопнул бы объединение в один
 * объект с пересечением полей и потерял связь между `type` и нагрузками.
 */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** Запись истории без метки времени — её проставляет `push`. */
export type HistoryEntryInput = DistributiveOmit<HistoryEntry, 'timestamp'>;

/**
 * Запись в стеке: с номером, который больше ни у одной записи не повторится.
 *
 * По номеру записи, на которой стоит история, редактор понимает, то же ли
 * это состояние данных, что было сохранено. Позиции в стеке для этого мало:
 * после отмены и новой правки позиция та же, а данные другие.
 */
export type StoredEntry = HistoryEntry & { id: number };

/**
 * Открытая правка панели: записи, сделанные из панели после `startIndex`,
 * сольются в одну, когда правка закроется.
 */
export interface EditSession {
  /** Чья правка: `card:<ключ карточки>`, `kinds`. */
  key: string;
  /** Как запись назовётся на кнопке отмены. */
  description: string;
  /** Позиция в стеке перед первой правкой панели. */
  startIndex: number;
  /** Отпечаток данных до правки: если после неё данные те же, записи не будет. */
  fingerprint: string;
  /** Идёт запись из самой панели — её не считают записью «со стороны». */
  active: boolean;
}

interface HistoryState {
  entries: StoredEntry[];
  currentIndex: number;
  maxEntries: number;
  /** Номер для следующей записи. */
  nextId: number;

  push: (entry: HistoryEntryInput) => void;
  /**
   * Заменяет последнюю запись новой.
   *
   * Нужна, чтобы подряд идущие однотипные действия были одной записью:
   * пять нажатий стрелки — один шаг отмены, а не пять.
   */
  replaceLast: (entry: HistoryEntryInput) => void;
  undo: () => HistoryEntry | null;
  redo: () => HistoryEntry | null;
  clear: () => void;

  /**
   * Номер записи, на которой стоит история; 0 — исходные данные без правок.
   * Одинаковый номер означает одинаковое состояние данных.
   */
  stateId: () => number;

  canUndo: () => boolean;
  canRedo: () => boolean;
  getUndoDescription: () => string | null;
  getRedoDescription: () => string | null;

  /** Открытая правка панели; `null` — правки пишутся по одной, как обычно. */
  session: EditSession | null;
  openSession: (session: EditSession) => void;
  updateSession: (patch: Partial<Pick<EditSession, 'description' | 'active'>>) => void;
  endSession: () => void;
  /**
   * Что сделать перед записью «со стороны» — действием на карте, клавишей,
   * другой панелью, — пока открыта правка панели: закрыть её. Иначе чужое
   * действие попало бы в запись панели.
   */
  onForeignWrite: (() => void) | null;
  setOnForeignWrite: (handler: () => void) => void;
  /** Сливает записи после `startIndex` в одну запись-группу. */
  mergeFrom: (startIndex: number, description: string) => void;
  /** Отбрасывает записи после `startIndex`, в том числе те, что можно было повторить. */
  truncateTo: (startIndex: number) => void;
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  entries: [],
  currentIndex: -1,
  maxEntries: 200,
  nextId: 1,

  push: (entry) => {
    closeForeign(get);
    set((state) => {
      // Новое действие после отмены делает невозможным повтор того, что было
      // отменено, поэтому хвост за текущей позицией отбрасывается.
      const newEntries = state.entries.slice(0, state.currentIndex + 1);

      newEntries.push({ ...entry, timestamp: Date.now(), id: state.nextId } as StoredEntry);

      while (newEntries.length > state.maxEntries) {
        newEntries.shift();
      }

      return {
        entries: newEntries,
        currentIndex: newEntries.length - 1,
        nextId: state.nextId + 1,
      };
    });
  },

  replaceLast: (entry) => {
    closeForeign(get);
    set((state) => {
      if (state.currentIndex < 0) return state;
      const entries = state.entries.slice(0, state.currentIndex + 1);
      // Новый номер: данные после слияния другие, чем были у прежней записи.
      entries[state.currentIndex] = { ...entry, timestamp: Date.now(), id: state.nextId } as StoredEntry;
      return { entries, currentIndex: state.currentIndex, nextId: state.nextId + 1 };
    });
  },

  undo: () => {
    const { entries, currentIndex } = get();
    if (currentIndex < 0) return null;

    const entry = entries[currentIndex];
    set({ currentIndex: currentIndex - 1 });
    return entry;
  },

  redo: () => {
    const { entries, currentIndex } = get();
    if (currentIndex >= entries.length - 1) return null;

    const entry = entries[currentIndex + 1];
    set({ currentIndex: currentIndex + 1 });
    return entry;
  },

  clear: () => set({ entries: [], currentIndex: -1, session: null }),

  stateId: () => {
    const { entries, currentIndex } = get();
    return currentIndex >= 0 ? entries[currentIndex].id : 0;
  },

  canUndo: () => get().currentIndex >= 0,
  canRedo: () => get().currentIndex < get().entries.length - 1,

  getUndoDescription: () => {
    const { entries, currentIndex } = get();
    return currentIndex >= 0 ? entries[currentIndex].description : null;
  },

  getRedoDescription: () => {
    const { entries, currentIndex } = get();
    return currentIndex < entries.length - 1 ? entries[currentIndex + 1].description : null;
  },

  session: null,
  openSession: (session) => set({ session }),
  updateSession: (patch) =>
    set((state) => (state.session ? { session: { ...state.session, ...patch } } : state)),
  endSession: () => set({ session: null }),

  onForeignWrite: null,
  setOnForeignWrite: (handler) => set({ onForeignWrite: handler }),

  mergeFrom: (startIndex, description) =>
    set((state) => {
      const merged = state.entries.slice(startIndex + 1, state.currentIndex + 1);
      if (merged.length < 2) return state;
      const entries = state.entries.slice(0, startIndex + 1);
      entries.push({
        type: 'GROUP',
        description,
        timestamp: Date.now(),
        id: state.nextId,
        undoData: { entries: merged },
        redoData: { entries: merged },
      });
      return { entries, currentIndex: entries.length - 1, nextId: state.nextId + 1 };
    }),

  truncateTo: (startIndex) =>
    set((state) => {
      const entries = state.entries.slice(0, Math.max(0, startIndex + 1));
      return { entries, currentIndex: entries.length - 1 };
    }),
}));

/** Запись «со стороны» при открытой правке панели сначала закрывает её. */
function closeForeign(get: () => HistoryState): void {
  const { session, onForeignWrite } = get();
  if (session && !session.active) onForeignWrite?.();
}
