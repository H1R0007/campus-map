import type { DatasetSource } from '../types/dataset.js';
import { DATA_ROOT } from './paths.js';

export interface HttpDatasetSourceOptions {
  /**
   * Базовый URL каталога с данными.
   * По умолчанию `/data` — данные раздаются статикой приложения.
   */
  baseUrl?: string;

  /** Произвольный fetch — удобно для тестов и для SSR. */
  fetchImpl?: typeof fetch;
}

/**
 * Источник датасета поверх HTTP.
 *
 * Отдаёт `null` для отсутствующих файлов (HTTP 404), чтобы загрузчик мог
 * отличить «файла нет» от «файл битый». Остальные ошибки — сеть, не-JSON
 * содержимое — пробрасываются наверх с понятным сообщением.
 */
export function createHttpDatasetSource(options: HttpDatasetSourceOptions = {}): DatasetSource {
  const baseUrl = (options.baseUrl ?? `/${DATA_ROOT}`).replace(/\/+$/, '');
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async readJson(path: string): Promise<unknown | null> {
      const url = `${baseUrl}/${path.replace(/^\/+/, '')}`;

      let response: Response;
      try {
        response = await fetchImpl(url);
      } catch (cause) {
        throw new Error(
          `Не удалось запросить ${url}: ${cause instanceof Error ? cause.message : String(cause)}`
        );
      }

      if (response.status === 404) {
        return null;
      }
      if (!response.ok) {
        throw new Error(`Не удалось загрузить ${url}: HTTP ${response.status}`);
      }

      const text = await response.text();

      // Защита от BOM и от ситуации, когда вместо файла отдаётся HTML
      // (SPA-fallback на неизвестный путь).
      const body = text.replace(/^\uFEFF/, '').trimStart();
      if (body.startsWith('<')) {
        throw new Error(
          `По адресу ${url} отдан HTML вместо JSON — проверьте, что каталог ` +
            `с данными подключён к приложению (см. vite-plugin-campus-data)`
        );
      }

      try {
        return JSON.parse(body) as unknown;
      } catch (cause) {
        throw new Error(
          `Некорректный JSON в ${url}: ${cause instanceof Error ? cause.message : String(cause)}`
        );
      }
    },
  };
}
