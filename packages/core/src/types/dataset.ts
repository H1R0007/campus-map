import type { AliasEntry } from './alias.js';
import type { BuildingMeta, CampusMeta } from './building.js';
import type { MapNode } from './node.js';
import type { Transition } from './transition.js';

/**
 * Источник файлов датасета.
 *
 * Загрузчик ядра не знает, откуда берутся данные — по HTTP, из ZIP-архива
 * или с диска. Он работает через этот интерфейс, поэтому пайплайн
 * нормализации существует в единственном экземпляре.
 */
export interface DatasetSource {
  /**
   * Читает и парсит JSON по пути относительно корня данных.
   *
   * Примеры путей: `campus/meta.json`, `buildings/building_a/meta.json`,
   * `buildings/building_a/floors/1/graph.json`.
   *
   * @returns разобранный JSON либо `null`, если файла нет. Отсутствие
   *          необязательных файлов (`transitions.json`, `aliases.json`)
   *          не является ошибкой.
   * @throws если файл существует, но не является валидным JSON.
   */
  readJson(path: string): Promise<unknown | null>;
}

/**
 * Полностью нормализованный датасет кампуса.
 *
 * Все значения приведены к типам ядра: координаты — числа, `neighbors` —
 * массивы, типы переходов — `TransitionType`, алиасы — форма `names`.
 * Это единственная точка, где «сырой» JSON превращается в доменные типы.
 */
export interface Dataset {
  campusMeta: CampusMeta;
  buildingMetas: BuildingMeta[];
  nodes: MapNode[];
  transitions: Transition[];
  aliases: AliasEntry[];
}

/**
 * Результат загрузки датасета.
 */
export interface DatasetLoadResult {
  dataset: Dataset;

  /**
   * Некритичные проблемы, найденные при нормализации: узлы без `id`,
   * неизвестные типы переходов, отсутствующие файлы этажей.
   *
   * Загрузка не прерывается — редактор должен уметь открыть даже битый
   * датасет, чтобы его починить.
   */
  warnings: string[];
}
