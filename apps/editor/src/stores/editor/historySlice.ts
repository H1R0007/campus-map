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

  /**
   * Правка из панели: всё, что панель записывает в историю, пока открыта её
   * правка, сольётся в одну запись. Правка открывается первым вызовом и
   * закрывается `closeSession`, записью «со стороны», отменой, сохранением.
   *
   * @param key чья правка: другая панель сначала закрывает прежнюю
   * @param description как запись назовётся на кнопке отмены
   */
  runInSession: (key: string, description: string, fn: () => void) => void;
  /** Применяет правку панели: её записи становятся одной; ничего не изменилось — записи нет вовсе. */
  closeSession: () => void;
  /** Возвращает всё, что сделано в панели с начала правки, и забывает эти записи. */
  revertSession: () => void;
}

/**
 * Отпечаток данных — чтобы понять, изменила ли правка панели хоть что-то.
 * Галочку поставили и сняли — данные те же, и записи в истории быть не должно.
 */
function dataFingerprint(st: EditorStore): string {
  return JSON.stringify([
    [...st.nodes.values()],
    st.transitions,
    [...st.aliases.entries()],
    [...st.aliasCategories.entries()],
    [...st.aliasTranslations.entries()],
    st.placeKinds,
    [...st.buildingMetas.values()],
    st.campusMeta,
    [...st.planFiles.entries()],
  ]);
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
    // Отмена при открытой правке панели отменяет её целиком.
    get().closeSession();
    // Совмещение — про план, каким он был; после отмены оно не о том.
    if (get().alignment) get().cancelAlignment();
    const entry = useHistoryStore.getState().undo();
    if (entry) applyEntry('undo', entry, set, get);
  },

  redo: () => {
    get().closeSession();
    if (get().alignment) get().cancelAlignment();
    const entry = useHistoryStore.getState().redo();
    if (entry) applyEntry('redo', entry, set, get);
  },

  runInSession: (key, description, fn) => {
    const history = useHistoryStore.getState();
    if (history.session && history.session.key !== key) get().closeSession();

    if (!useHistoryStore.getState().session) {
      history.setOnForeignWrite(() => get().closeSession());
      history.openSession({
        key,
        description,
        startIndex: useHistoryStore.getState().currentIndex,
        fingerprint: dataFingerprint(get()),
        active: false,
      });
    }

    useHistoryStore.getState().updateSession({ description, active: true });
    try {
      fn();
    } finally {
      useHistoryStore.getState().updateSession({ active: false });
    }
  },

  closeSession: () => {
    const history = useHistoryStore.getState();
    const session = history.session;
    if (!session) return;
    history.endSession();

    const count = useHistoryStore.getState().currentIndex - session.startIndex;
    if (count <= 0) return;
    if (dataFingerprint(get()) === session.fingerprint) {
      useHistoryStore.getState().truncateTo(session.startIndex);
      return;
    }
    useHistoryStore.getState().mergeFrom(session.startIndex, session.description);
  },

  revertSession: () => {
    const history = useHistoryStore.getState();
    const session = history.session;
    if (!session) return;
    history.endSession();

    const { entries, currentIndex } = useHistoryStore.getState();
    const done = entries.slice(session.startIndex + 1, currentIndex + 1).reverse();
    if (done.length === 0) return;
    set((s) => {
      for (const entry of done) applyUndo(s, entry);
    });
    useHistoryStore.getState().truncateTo(session.startIndex);
    get().showNotice(`Отменено: ${session.description}`);
  },
});
