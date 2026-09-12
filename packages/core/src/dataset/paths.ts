/**
 * Каноническая раскладка файлов датасета.
 *
 * Все пути относительны к корню данных (`data/`). Централизованы здесь,
 * чтобы загрузчик, HTTP-источник, импорт из ZIP и экспорт строили адреса
 * одинаково — раньше каждый из них собирал пути строковым шаблоном сам.
 */

/** Имя каталога с данными относительно корня приложения. */
export const DATA_ROOT = 'data';

export const CAMPUS_META_PATH = 'campus/meta.json';
export const CAMPUS_GRAPH_PATH = 'campus/graph.json';
export const CAMPUS_MAP_PATH = 'campus/map.png';
export const TRANSITIONS_PATH = 'transitions.json';
export const ALIASES_PATH = 'aliases.json';

/** ID корпуса, которому принадлежат узлы территории кампуса. */
export const CAMPUS_BUILDING_ID = 'CAMPUS';

/** Номер этажа для узлов территории кампуса. */
export const CAMPUS_FLOOR = 0;

/** Путь к `meta.json` корпуса. */
export function buildingMetaPath(buildingId: string): string {
  return `buildings/${buildingId}/meta.json`;
}

/** Путь к файлу внутри каталога этажа. */
export function floorAssetPath(
  buildingId: string,
  floor: number,
  fileName: string
): string {
  return `buildings/${buildingId}/floors/${floor}/${fileName}`;
}

/** Путь к `graph.json` этажа. */
export function floorGraphPath(buildingId: string, floor: number): string {
  return floorAssetPath(buildingId, floor, 'graph.json');
}

/** Путь к карте этажа. */
export function floorMapPath(buildingId: string, floor: number): string {
  return floorAssetPath(buildingId, floor, 'map.png');
}

/**
 * Превращает относительный путь датасета в URL.
 *
 * Приложения не должны склеивать `/data/...` строковыми шаблонами сами:
 * корень может отличаться (подпапка при деплое), а опечатка в пути молча
 * превращается в 404.
 */
export function datasetUrl(path: string, baseUrl: string = `/${DATA_ROOT}`): string {
  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

/**
 * URL карты этажа.
 */
export function floorMapUrl(
  buildingId: string,
  floor: number,
  baseUrl: string = `/${DATA_ROOT}`
): string {
  return datasetUrl(floorMapPath(buildingId, floor), baseUrl);
}

/** URL карты кампуса. */
export function campusMapUrl(baseUrl: string = `/${DATA_ROOT}`): string {
  return datasetUrl(CAMPUS_MAP_PATH, baseUrl);
}
