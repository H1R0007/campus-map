import type { DatasetSource } from '../../src/index.js';

/** Файлы датасета в памяти: путь от корня датасета → разобранный JSON. */
export type DatasetFiles = Record<string, unknown>;

/** Источник, который помнит, какие файлы у него запрашивали. */
export interface RecordingSource extends DatasetSource {
  requested: string[];
}

/**
 * Источник данных в памяти.
 *
 * Отсутствующий путь отдаёт `null`, как и настоящие источники: для загрузчика
 * это «файла нет», а не ошибка.
 *
 * @param delayOf задержка ответа по пути — чтобы проверить, что результат
 *        не зависит от порядка прихода ответов при параллельной загрузке
 */
export function memorySource(
  files: DatasetFiles,
  delayOf?: (path: string) => number
): RecordingSource {
  const requested: string[] = [];

  return {
    requested,
    async readJson(path) {
      requested.push(path);
      const delay = delayOf?.(path) ?? 0;
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
      return Object.prototype.hasOwnProperty.call(files, path) ? files[path] : null;
    },
  };
}
