import { DEFAULT_PLAN_FORMAT } from '../types/building.js';
import type { PlanFormat } from '../types/building.js';

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

export const TRANSITIONS_PATH = 'transitions.json';
export const ALIASES_PATH = 'aliases.json';

/** Каталог видов точек: заготовки разметчика, навигатору не нужны. */
export const PLACE_KINDS_PATH = 'place-kinds.json';

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

/** Путь к плану этажа в формате из данных (`planFormatOf`). */
export function floorMapPath(
  buildingId: string,
  floor: number,
  format: PlanFormat = DEFAULT_PLAN_FORMAT
): string {
  return floorAssetPath(buildingId, floor, `map.${format}`);
}

/** Путь к плану территории в формате из данных (`planFormatOf`). */
export function campusMapPath(format: PlanFormat = DEFAULT_PLAN_FORMAT): string {
  return `campus/map.${format}`;
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
  baseUrl: string = `/${DATA_ROOT}`,
  format: PlanFormat = DEFAULT_PLAN_FORMAT
): string {
  return datasetUrl(floorMapPath(buildingId, floor, format), baseUrl);
}

/** URL плана территории. */
export function campusMapUrl(
  baseUrl: string = `/${DATA_ROOT}`,
  format: PlanFormat = DEFAULT_PLAN_FORMAT
): string {
  return datasetUrl(campusMapPath(format), baseUrl);
}
