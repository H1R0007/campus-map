import { useSyncExternalStore } from 'react';

function subscribe(onChange: () => void): () => void {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

/**
 * Есть ли у браузера связь — по `navigator.onLine` и его событиям.
 *
 * «Связь есть» не значит, что сервер отвечает: сеть вуза без интернета браузер
 * тоже считает связью. Поэтому по этому признаку навигатор только сообщает о
 * пропаже связи и не пытается загрузить заранее то, что всё равно не дойдёт; сами
 * запросы по-прежнему могут не удаться (запись 26).
 */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true
  );
}
