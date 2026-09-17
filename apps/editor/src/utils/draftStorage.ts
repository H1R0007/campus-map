import type { Dataset } from '@campus-map/core';

/**
 * Черновик несохранённой работы в браузере.
 *
 * Разметка сотен узлов — часы работы, а закрытая вкладка или перезагрузка
 * страницы стирали всё без следа. Черновик пишется сам, пока есть
 * несохранённые правки, и предлагается к восстановлению при следующем
 * открытии.
 *
 * Хранилище — IndexedDB, а не `localStorage`: датасет вуза на пять корпусов
 * не помещается в отведённые вкладке пять мегабайт, а сериализация на каждую
 * правку заметно дорога.
 */

const DB_NAME = 'campus-map-editor';
const STORE = 'drafts';
const KEY = 'current';
const VERSION = 1;

export interface EditorDraft {
  /** Когда черновик записан. */
  savedAt: number;
  /** Данные целиком в том же виде, в каком их принимает `loadData`. */
  dataset: Dataset;
  /**
   * Отпечатки файлов на диске, с которыми работал редактор. По ним видно,
   * что данные на диске успели измениться после черновика.
   */
  base: Record<string, string>;
}

function openDatabase(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }

    const request = indexedDB.open(DB_NAME, VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    // Приватное окно или запрет на хранение: редактор работает без черновика.
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return openDatabase().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) {
          resolve(null);
          return;
        }

        try {
          const transaction = db.transaction(STORE, mode);
          const request = run(transaction.objectStore(STORE));
          request.onsuccess = () => resolve(request.result ?? null);
          request.onerror = () => resolve(null);
          transaction.oncomplete = () => db.close();
        } catch {
          db.close();
          resolve(null);
        }
      })
  );
}

/** Читает черновик; `null` — черновика нет или хранилище недоступно. */
export function readDraft(): Promise<EditorDraft | null> {
  return withStore<EditorDraft>('readonly', (store) => store.get(KEY) as IDBRequest<EditorDraft>);
}

/** Записывает черновик поверх прежнего. */
export async function writeDraft(draft: EditorDraft): Promise<void> {
  await withStore('readwrite', (store) => store.put(draft, KEY) as IDBRequest<IDBValidKey>);
}

/** Удаляет черновик: работа сохранена или человек от него отказался. */
export async function clearDraft(): Promise<void> {
  await withStore('readwrite', (store) => store.delete(KEY) as IDBRequest<undefined>);
}
