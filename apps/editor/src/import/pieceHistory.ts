/**
 * Отмена и повтор в мастерской листов (запись 80): своя история, не общая с
 * редактором — правки листов ещё не данные карты, их добавляет в карту одна
 * общая правка «Загружены планы».
 *
 * Запоминается состояние до правки. Подряд идущие правки с одним ключом —
 * набор номера этажа по буквам, перетаскивание угла — одна запись: отмена
 * возвращает поле целиком, а не по букве.
 */

export interface History<T> {
  past: T[];
  future: T[];
  /** Ключ последней правки: следующая с тем же ключом в историю не пишется. */
  lastKey: string | null;
}

/** Сколько шагов отмены держится. */
export const HISTORY_LIMIT = 100;

export const emptyHistory = <T>(): History<T> => ({ past: [], future: [], lastKey: null });

/** Перед правкой: запомнить `current`; с тем же ключом, что прошлая правка, — нет. */
export function record<T>(history: History<T>, current: T, key: string | null = null): History<T> {
  if (key !== null && key === history.lastKey) return history;
  return { past: [...history.past, current].slice(-HISTORY_LIMIT), future: [], lastKey: key };
}

/** Отмена: прежнее состояние и история после неё; `null` — отменять нечего. */
export function undo<T>(history: History<T>, current: T): { history: History<T>; value: T } | null {
  if (history.past.length === 0) return null;
  return {
    value: history.past[history.past.length - 1],
    history: { past: history.past.slice(0, -1), future: [current, ...history.future], lastKey: null },
  };
}

/** Повтор отменённого; `null` — повторять нечего. */
export function redo<T>(history: History<T>, current: T): { history: History<T>; value: T } | null {
  if (history.future.length === 0) return null;
  return {
    value: history.future[0],
    history: { past: [...history.past, current], future: history.future.slice(1), lastKey: null },
  };
}
