import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDataset } from '../../src/index.js';
import type { Dataset, DatasetLoadResult, DatasetSource } from '../../src/index.js';

/**
 * Каталог `data/` в корне монорепо.
 *
 * Тесты ядра работают на тех же данных, что и приложения: расхождение между
 * тестовым фикстуром и реальным датасетом означало бы, что проверка проходит
 * на данных, которых в продукте нет.
 */
export const DATA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../data');

/**
 * Источник датасета поверх файловой системы.
 *
 * Тот же интерфейс `DatasetSource`, через который приложения читают данные по
 * HTTP, а редактор — из ZIP. Наличие этого источника и есть причина, по
 * которой загрузчик ядра не знает про `fetch`.
 */
export function createFsDatasetSource(dataDir: string = DATA_DIR): DatasetSource {
  return {
    async readJson(relativePath: string): Promise<unknown | null> {
      const fullPath = path.join(dataDir, relativePath);
      if (!existsSync(fullPath)) return null;

      const text = readFileSync(fullPath, 'utf-8');
      return JSON.parse(text.replace(/^\uFEFF/, '').trimStart()) as unknown;
    },
  };
}

let cached: DatasetLoadResult | null = null;

/**
 * Загружает реальный датасет один раз на весь прогон.
 *
 * Загрузка читает около двадцати файлов, и повторять её в каждом тесте
 * значит замедлять прогон без пользы: датасет в тестах не изменяется.
 */
export async function loadFixtureDataset(): Promise<DatasetLoadResult> {
  if (cached === null) {
    cached = await loadDataset(createFsDatasetSource());
  }
  return cached;
}

/** Датасет без обёртки результата загрузки. */
export async function fixtureDataset(): Promise<Dataset> {
  const { dataset } = await loadFixtureDataset();
  return dataset;
}
