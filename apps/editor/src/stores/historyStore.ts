import { create } from 'zustand';

export type ActionType =
  | 'ADD_NODE'
  | 'REMOVE_NODE'
  | 'MOVE_NODE'
  | 'UPDATE_NODE'
  | 'ADD_EDGE'
  | 'REMOVE_EDGE'
  | 'ADD_TRANSITION'
  | 'REMOVE_TRANSITION'
  | 'SET_ALIASES'
  | 'BATCH';

export interface HistoryEntry {
  type: ActionType;
  description: string;
  timestamp: number;
  undoData: unknown;
  redoData: unknown;
}

interface HistoryState {
  entries: HistoryEntry[];
  currentIndex: number;
  maxEntries: number;

  push: (entry: Omit<HistoryEntry, 'timestamp'>) => void;
  undo: () => HistoryEntry | null;
  redo: () => HistoryEntry | null;
  clear: () => void;

  canUndo: () => boolean;
  canRedo: () => boolean;
  getUndoDescription: () => string | null;
  getRedoDescription: () => string | null;
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  entries: [],
  currentIndex: -1,
  maxEntries: 200,

  push: (entry) =>
    set((state) => {
      // ќтсекаем записи после текущей позиции (при новом действии после undo)
      const newEntries = state.entries.slice(0, state.currentIndex + 1);

      newEntries.push({
        ...entry,
        timestamp: Date.now(),
      });

      // ќграничиваем размер истории
      while (newEntries.length > state.maxEntries) {
        newEntries.shift();
      }

      return {
        entries: newEntries,
        currentIndex: newEntries.length - 1,
      };
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