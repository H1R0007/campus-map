/**
 * @campus-map/mapkit — общая обвязка Leaflet-карты.
 *
 * Навигатор и редактор показывают одну и ту же растровую подложку в
 * пиксельной системе координат, но живут в разных приложениях. Пакет
 * выносит общий слой, чтобы особенности `CRS.Simple`, подгонка viewport и
 * определение размеров плана существовали в одном экземпляре.
 */

export { PixelMap, fitPaddingOf, usePixelMapGeometry } from './PixelMap.js';
export type { MapInsets, PixelMapGeometry, PixelMapProps } from './PixelMap.js';

export type { ImageSize, ImageStatus } from './useImageSize.js';
