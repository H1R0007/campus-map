import { create } from 'zustand';
import type { MapNode, PlaceCategory, PlaceKind, Transition } from '@campus-map/core';

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

/** Изменение признака портала у узла. */
export interface PortalChange {
  nodeId: string;
  isPortal: boolean;
}

/** Слепок алиасов узла: алиасы живут отдельно от узла. */
export interface AliasSnapshot {
  id: string;
  names: string[];
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
  | { kind: 'setPortal'; changes: PortalChange[] }
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
    };

/** Нагрузки повтора для составных действий. */
export type BatchRedoPayload =
  | { kind: 'line'; nodes: MapNode[] }
  | { kind: 'deleteMultiple'; nodeIds: string[] }
  | { kind: 'moveMultiple'; positions: NodePosition[] }
  | { kind: 'setPortal'; nodeIds: string[]; isPortal: boolean }
  | { kind: 'chainConnect'; nodeIds: string[] }
  | {
      kind: 'autofix';
      fixedNodesNeighbors: NeighborSnapshot;
      fixedTransitions: Transition[];
      fixedCoordinates: Record<string, { x: number; y: number }>;
    }
  | { kind: 'splitEdge'; newNode: MapNode; fromId: string; toId: string };

/** Тип действия, по которому ветвится применение отмены и повтора. */
export type ActionType =
  | 'ADD_NODE'
  | 'REMOVE_NODE'
  | 'MOVE_NODE'
  | 'UPDATE_NODE'
  | 'ADD_EDGE'
  | 'REMOVE_EDGE'
  | 'ADD_TRANSITION'
  | 'REMOVE_TRANSITION'
  | 'UPDATE_TRANSITION'
  | 'SET_ALIASES'
  | 'SET_CATEGORY'
  | 'SET_PLACE_KINDS'
  | 'BATCH';

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
        aliases: string[];
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
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  entries: [],
  currentIndex: -1,
  maxEntries: 200,
  nextId: 1,

  push: (entry) =>
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
    }),

  replaceLast: (entry) =>
    set((state) => {
      if (state.currentIndex < 0) return state;
      const entries = state.entries.slice(0, state.currentIndex + 1);
      // Новый номер: данные после слияния другие, чем были у прежней записи.
      entries[state.currentIndex] = { ...entry, timestamp: Date.now(), id: state.nextId } as StoredEntry;
      return { entries, currentIndex: state.currentIndex, nextId: state.nextId + 1 };
    }),

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

  clear: () => set({ entries: [], currentIndex: -1 }),

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
}));
