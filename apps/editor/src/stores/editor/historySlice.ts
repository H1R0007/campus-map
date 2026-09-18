import type { Draft } from 'immer';
import { isNodeInScope, scopeOfFloor } from '@campus-map/core';
import { useHistoryStore } from '../historyStore';
import type { HistoryEntry } from '../historyStore';
import { applyRedo, applyUndo, entryNodes } from './historyApply';
import type { EditorSlice } from './types';
import type { EditorStore } from './types';

/**
 * Отмена и повтор действий и признак несохранённых правок.
 *
 * Сам стек записей живёт в `historyStore`: его читают панели истории, не
 * подписываясь на весь стор редактора.
 */
export interface HistorySlice {
  /**
   * Номер состояния истории, которое лежит в сохранённых данных; 0 — данные
   * как они были загружены.
   *
   * Отдельного флага «есть несохранённые правки» нет: он расходился бы с
   * действительностью после отмены. Правки не сохранены ровно тогда, когда
   * `useHistoryStore.stateId() !== savedStateId` — см. `useUnsavedChanges`.
   */
  savedStateId: number;

  /** Запоминает текущее состояние как сохранённое. */
  markSaved: () => void;

  undo: () => void;
  redo: () => void;
}

/**
 * Применяет запись истории и показывает, что изменилось.
 *
 * Отменённая правка может оказаться на другом плане — тогда редактор
 * открывает его и выделяет затронутые узлы: иначе отмена выглядит так,
 * будто ничего не произошло.
 */
function applyEntry(
  direction: 'undo' | 'redo',
  entry: HistoryEntry,
  set: (updater: (state: Draft<EditorStore>) => void) => void,
  get: () => EditorStore
): void {
  set((s) => {
    if (direction === 'undo') applyUndo(s, entry);
    else applyRedo(s, entry);
  });

  const st = get();
  const nodes = entryNodes(entry)
    .map((id) => st.nodes.get(id))
    .filter((node) => node !== undefined);

  // План открывается, только если отменённого на нём не видно: у перехода
  // между этажами один конец обычно здесь, и уводить карту незачем. Выделение
  // при этом не трогается: человек отменяет правку, продолжая работать с тем
  // узлом, который выбрал.
  const scope = scopeOfFloor(st.currentBuilding, st.currentFloor);
  if (nodes.length > 0 && !nodes.some((node) => isNodeInScope(node, scope))) {
    st.navigateToNode(nodes[0].id);
  }

  st.showNotice(`${direction === 'undo' ? 'Отменено' : 'Повторено'}: ${entry.description}`);
}

export const createHistorySlice: EditorSlice<HistorySlice> = (set, get) => ({
  savedStateId: 0,

  markSaved: () =>
    set((s) => {
      s.savedStateId = useHistoryStore.getState().stateId();
    }),

  undo: () => {
    const entry = useHistoryStore.getState().undo();
    if (entry) applyEntry('undo', entry, set, get);
  },

  redo: () => {
    const entry = useHistoryStore.getState().redo();
    if (entry) applyEntry('redo', entry, set, get);
  },
});
