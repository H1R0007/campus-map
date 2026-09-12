/**
 * @campus-map/core — доменное ядро навигатора.
 *
 * Пакет не зависит ни от React, ни от Leaflet, ни от файловой системы и не
 * использует `console`. Всё, что связано с вводом-выводом, спрятано за
 * интерфейсом {@link DatasetSource}: ядро принимает уже разобранные данные.
 *
 * Слои:
 *
 * - `dataset/` — единственный пайплайн загрузки и нормализации датасета;
 * - `graph/`   — индексированный граф и проверка связности;
 * - `pathfinding/` — A* и альтернативные маршруты;
 * - `aliases/` — нечёткий поиск по названиям;
 * - `types/`   — доменные типы и контракт формата данных.
 */

// Типы и контракт данных
export * from './types/index.js';

// Примитивы геометрии и идентификации рёбер
export { distance, edgeKey, floorKey } from './geometry.js';

// Раскладка файлов датасета
export {
  ALIASES_PATH,
  CAMPUS_BUILDING_ID,
  CAMPUS_FLOOR,
  CAMPUS_GRAPH_PATH,
  CAMPUS_MAP_PATH,
  CAMPUS_META_PATH,
  DATA_ROOT,
  TRANSITIONS_PATH,
  buildingMetaPath,
  floorAssetPath,
  floorGraphPath,
  floorMapPath,
} from './dataset/paths.js';

// Загрузка и нормализация датасета
export {
  indexAliases,
  indexBuildingMetas,
  indexNodes,
  loadDataset,
} from './dataset/loader.js';
export {
  createHttpDatasetSource,
  type HttpDatasetSourceOptions,
} from './dataset/httpSource.js';

// Граф
export { Graph } from './graph/Graph.js';
export {
  findConnectedComponents,
  type ConnectivityResult,
} from './graph/connectivity.js';

// Поиск пути
export { findAlternativePaths, findPath } from './pathfinding/astar.js';

// Поиск по названиям
export { AliasManager } from './aliases/AliasManager.js';
