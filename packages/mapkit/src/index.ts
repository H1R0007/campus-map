/**
 * @campus-map/mapkit — общая обвязка Leaflet-карты.
 *
 * Навигатор и редактор показывают одну и ту же растровую подложку в
 * пиксельной системе координат, но живут в разных приложениях. Пакет
 * выносит общий слой, чтобы особенности `CRS.Simple`, подгонка viewport и
 * определение размеров плана существовали в одном экземпляре.
 */

export { PixelMap, usePixelMapGeometry } from './PixelMap.js';
export type { PixelMapGeometry, PixelMapProps } from './PixelMap.js';

export type { ImageSize, ImageStatus } from './useImageSize.js';
