/**
 * @campus-map/mapkit — общая обвязка Leaflet-карты.
 *
 * Навигатор и редактор живут в разных приложениях, а показывают планы одинаково.
 * Пакет выносит общий слой, чтобы особенности `CRS.Simple`, подгонка вида под
 * интерфейс и загрузка планов существовали в одном экземпляре:
 *
 * - `PixelMap` — один план в пикселях изображения;
 * - `WorldMap` и `PlacedPlan` — холст кампуса в метрах, планы по привязке
 *   (запись 31).
 *
 * Здесь же обозначения типов переходов — цвет и значок: оба приложения
 * рисуют лестницы, лифты и входы одинаково.
 */

export { DEFAULT_INSETS, fitPaddingOf, useMapFrame } from './mapFrame.js';
export type { MapFrame, MapInsets } from './mapFrame.js';

export { FLY_DURATION_S, flyToBounds, stopZoomMotion, targetZoomOf, zoomSmoothly } from './smoothCamera.js';

export { bearingOf, rotateTo, viewBoundsOf } from './rotatingCrs.js';
export { useMapBearing } from './rotationGestures.js';

export { PixelMap } from './PixelMap.js';
export type { PixelMapProps } from './PixelMap.js';

export { WorldMap, meterLatLng } from './WorldMap.js';
export type { WorldMapProps } from './WorldMap.js';
export { PLAN_PANE, PlacedPlan, ensurePane } from './PlacedPlan.js';
export type { PlacedPlanProps } from './PlacedPlan.js';
export {
  containsPoint,
  distanceToPolygon,
  extentOf,
  planCorners,
  planPointToWorld,
  planTransform,
  unionExtent,
} from './placement.js';
export type { MeterExtent, MeterPoint, PlanPlacement } from './placement.js';

export type { ImageSize, ImageStatus } from './useImageSize.js';

export { TRANSITION_COLORS, transitionGlyphMarkup } from './transitionGlyphs.js';
export { TransitionGlyph } from './TransitionGlyph.js';
export type { TransitionGlyphProps } from './TransitionGlyph.js';
