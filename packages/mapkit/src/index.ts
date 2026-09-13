/**
 * @campus-map/mapkit — общая обвязка Leaflet-карты.
 *
 * Навигатор и редактор показывают одну и ту же растровую подложку в
 * пиксельной системе координат, но живут в разных приложениях. Пакет
 * выносит общий слой, чтобы особенности `CRS.Simple`, подгонка viewport и
 * определение размеров плана существовали в одном экземпляре.
 *
 * Здесь же обозначения типов переходов — цвет и значок: оба приложения
 * рисуют лестницы, лифты и входы одинаково.
 */

export { PixelMap, fitPaddingOf, usePixelMapGeometry } from './PixelMap.js';
export type { MapInsets, PixelMapGeometry, PixelMapProps } from './PixelMap.js';

export type { ImageSize, ImageStatus } from './useImageSize.js';

export { TRANSITION_COLORS, transitionGlyphMarkup } from './transitionGlyphs.js';
export { TransitionGlyph } from './TransitionGlyph.js';
export type { TransitionGlyphProps } from './TransitionGlyph.js';
