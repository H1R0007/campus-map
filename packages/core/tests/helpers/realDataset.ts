import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDataset } from '../../src/index.js';
import type { DatasetLoadResult, DatasetSource } from '../../src/index.js';

/**
 * Продуктовый датасет — каталог `data/` в корне монорепо.
 *
 * Тесты кода работают на синтетическом кампусе (`sampleDataset.ts`). Реальные
 * данные читают только проверки, которые обязаны выполняться при любой
 * разметке: инварианты `dataset.real.test.ts` и согласованность эвристики на
 * их топологии.
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

let cached: Promise<DatasetLoadResult> | null = null;

/**
 * Загружает `data/` один раз на весь прогон.
 *
 * Загрузка читает все файлы датасета, а сам датасет в тестах не меняется.
 */
export function loadRealDataset(): Promise<DatasetLoadResult> {
  cached ??= loadDataset(createFsDatasetSource());
  return cached;
}
