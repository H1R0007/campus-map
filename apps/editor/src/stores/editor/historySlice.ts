import { useHistoryStore } from '../historyStore';
import { applyRedo, applyUndo } from './historyApply';
import type { EditorSlice } from './types';

/**
 * Отмена и повтор действий над данными и признак несохранённых правок.
 *
 * Сам стек записей живёт в `historyStore`: его читают панели истории, не
 * подписываясь на весь стор редактора.
 */
export interface HistorySlice {
  hasUnsavedChanges: boolean;

  undo: () => void;
  redo: () => void;
}

export const createHistorySlice: EditorSlice<HistorySlice> = (set) => ({
  hasUnsavedChanges: false,

  undo: () => {
    const entry = useHistoryStore.getState().undo();
    if (!entry) return;

    set((s) => {
      applyUndo(s, entry);
      s.hasUnsavedChanges = true;
    });
  },

  redo: () => {
    const entry = useHistoryStore.getState().redo();
    if (!entry) return;

    set((s) => {
      applyRedo(s, entry);
      s.hasUnsavedChanges = true;
    });
  },
});
