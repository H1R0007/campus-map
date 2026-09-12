import JSZip from 'jszip';
import { loadDataset } from '@campus-map/core';
import type { DatasetLoadResult, DatasetSource } from '@campus-map/core';

/**
 * Импорт датасета из ZIP-архива.
 *
 * Архив читается тем же пайплайном `loadDataset`, что и данные с сервера:
 * ядро намеренно не знает, откуда приходят файлы, и работает через интерфейс
 * {@link DatasetSource}. Здесь реализован источник поверх JSZip.
 *
 * Раньше в этом файле жила вторая копия обхода каталогов и нормализации —
 * та же, что в `App.tsx` и в загрузчике ядра. Копии уже разошлись: эта, в
 * отличие от ядра, отбрасывала поле `comment` у узлов и не сообщала о
 * проблемах в данных, ограничиваясь `console.warn`.
 */

/**
 * Определяет корень данных внутри архива.
 *
 * Экспорт редактора кладёт файлы в `data/…`, но архив мог быть собран
 * вручную и содержать `campus/…` сразу в корне.
 */
function detectRoot(zip: JSZip): string {
  return zip.file('data/campus/meta.json') !== null ? 'data/' : '';
}

/**
 * Источник датасета поверх распакованного ZIP.
 *
 * @param root префикс каталога данных внутри архива, см. {@link detectRoot}.
 */
function createZipDatasetSource(zip: JSZip, root: string): DatasetSource {
  return {
    async readJson(path: string): Promise<unknown | null> {
      const file = zip.file(`${root}${path}`);

      // Отсутствие файла не ошибка здесь: обязателен он или нет, решает
      // загрузчик ядра — он же и предупреждение сформулирует.
      if (file === null) {
        return null;
      }

      const text = await file.async('string');

      try {
        // BOM и ведущие пробелы ломают `JSON.parse`, а в архивах, собранных
        // разными редакторами, встречаются регулярно.
        return JSON.parse(text.replace(/^\uFEFF/, '').trimStart()) as unknown;
      } catch (cause) {
        throw new Error(
          `Некорректный JSON в ${path}: ${cause instanceof Error ? cause.message : String(cause)}`
        );
      }
    },
  };
}

/**
 * Читает датасет из ZIP-файла.
 *
 * @returns нормализованный датасет и список предупреждений загрузчика —
 *   тот же результат, что даёт загрузка по HTTP, поэтому передаётся в
 *   `loadData` без дополнительных преобразований.
 * @throws если архив не читается или в нём нет `campus/meta.json`.
 */
export async function importDatasetFromZip(file: File): Promise<DatasetLoadResult> {
  const zip = await JSZip.loadAsync(file);

  return loadDataset(createZipDatasetSource(zip, detectRoot(zip)));
}
