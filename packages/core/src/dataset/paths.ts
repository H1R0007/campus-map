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
 * Каталог фото точек (запись 85).
 *
 * Фото лежат одним плоским каталогом, а не у этажей: имя — отпечаток
 * содержимого, и один снимок у двух точек хранится один раз. Настоящие фото в
 * публичный репозиторий не попадают: редактор и сборка берут их из общей папки
 * фото (`CAMPUS_PHOTOS_DIR`), а в `data/photos/` лежат только тестовые
 * картинки генератора.
 */
export const PHOTOS_DIR = 'photos';

/**
 * Имя файла фото: 16 знаков отпечатка SHA-256 и формат.
 *
 * Только растровые форматы, которые открывает любой браузер. SVG — нет:
 * открытый по прямой ссылке, он выполнил бы свой скрипт.
 */
export const PHOTO_FILE = /^[0-9a-f]{16}\.(?:webp|jpg|png)$/;

/** Какой размер фото: полное — во весь экран, маленькое — в карточке и на шаге. */
export type PhotoSize = 'full' | 'small';

/**
 * Путь к фото внутри данных. Маленькое лежит рядом с полным:
 * `3f2a9c1b7d4e8a01.webp` → `3f2a9c1b7d4e8a01.small.webp`.
 */
export function photoPath(file: string, size: PhotoSize = 'full'): string {
  const name = size === 'small' ? file.replace(/\.([a-z]+)$/, '.small.$1') : file;
  return `${PHOTOS_DIR}/${name}`;
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

/** URL фото точки нужного размера. */
export function photoUrl(file: string, size: PhotoSize = 'full', baseUrl: string = `/${DATA_ROOT}`): string {
  return datasetUrl(photoPath(file, size), baseUrl);
}
