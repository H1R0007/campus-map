import L from 'leaflet';
import { angleDelta, normalizeBearing, rotateAround } from './bearing.js';
import type { MeterPoint } from './placement.js';
import { centerKeeping, prefersReducedMotion } from './smoothCamera.js';

/**
 * Поворот холста кампуса — в системе координат карты, а не поворотом страницы
 * (запись 36).
 *
 * Проекция поворачивает метры территории вокруг опорной точки на угол карты.
 * Leaflet по-прежнему считает всё в пикселях экрана, поэтому нажатия,
 * перетаскивание, щипок, линии и точки верны без поправок, а значки и подписи
 * остаются стоячими. Планы — изображения — поворачиваются CSS на свой угол
 * плюс угол карты (`PlacedPlan`).
 *
 * Прямоугольник в координатах карты Leaflet местами считает по двум углам — у
 * повёрнутой карты это не весь прямоугольник. Эти расчёты заменены на расчёт по
 * четырём углам (`installRotationBoundsMath`): границы вида, подгонка, пределы
 * прокрутки. Без поворота они дают то же, что штатные.
 */

interface RotatingProjection {
  bearing: number;
  readonly pivot: MeterPoint;
  readonly bounds: L.Bounds;
  project(latlng: L.LatLng): L.Point;
  unproject(point: L.Point): L.LatLng;
}

interface MapInternals {
  _move(center: L.LatLng, zoom: number, data?: { pinch?: boolean; round?: boolean }): void;
  _moveStart(zoomChanged: boolean, noMoveStart: boolean): void;
  _moveEnd(zoomChanged: boolean): void;
  _stop(): void;
  _resetView(center: L.LatLng, zoom: number, noMoveStart?: boolean): void;
  _limitZoom(zoom: number): number;
  _rebound(left: number, right: number): number;
  _getBoundsCenterZoom(bounds: L.LatLngBounds, options?: L.FitBoundsOptions): { center: L.LatLng; zoom: number };
  _getBoundsOffset(pxBounds: L.Bounds, maxBounds: L.LatLngBounds, zoom: number): L.Point;
}

export const mapInternals = (map: L.Map) => map as unknown as MapInternals;

/** Система координат холста с углом поворота; ось y вниз, как у `PLAN_CRS`. */
export function createRotatingCrs(pivot: MeterPoint): L.CRS {
  const projection: RotatingProjection = {
    bearing: 0,
    pivot,
    bounds: L.bounds([-1e9, -1e9], [1e9, 1e9]),
    project(latlng) {
      const point = rotateAround({ x: latlng.lng, y: latlng.lat }, this.pivot, this.bearing);
      return L.point(point.x, point.y);
    },
    unproject(point) {
      const meters = rotateAround({ x: point.x, y: point.y }, this.pivot, -this.bearing);
      return L.latLng(meters.y, meters.x);
    },
  };
  return L.extend({}, L.CRS.Simple, { transformation: new L.Transformation(1, 0, 1, 0), projection }) as L.CRS;
}

function projectionOf(map: L.Map): RotatingProjection | null {
  const projection = (map.options.crs as { projection?: Partial<RotatingProjection> } | undefined)?.projection;
  return projection && typeof projection.bearing === 'number' ? (projection as RotatingProjection) : null;
}

/** Можно ли карту поворачивать. */
export function isRotatable(map: L.Map): boolean {
  return projectionOf(map) !== null;
}

/** Угол карты, градусы по часовой; у карты без поворота — 0. */
export function bearingOf(map: L.Map): number {
  return projectionOf(map)?.bearing ?? 0;
}

const cornersOf = (bounds: L.LatLngBounds) => [
  bounds.getNorthWest(),
  bounds.getNorthEast(),
  bounds.getSouthEast(),
  bounds.getSouthWest(),
];

/** Прямоугольник карты из любого его описания: готовый — как есть. */
const toBounds = (bounds: L.LatLngBoundsExpression): L.LatLngBounds =>
  bounds instanceof L.LatLngBounds ? bounds : L.latLngBounds(bounds);

/** Прямоугольник в пикселях карты на масштабе `zoom`, охватывающий все четыре угла `bounds`. */
export function projectedBox(map: L.Map, bounds: L.LatLngBounds, zoom: number): L.Bounds {
  return L.bounds(cornersOf(bounds).map((corner) => map.project(corner, zoom)));
}

/** Прямоугольник в точках контейнера, охватывающий все четыре угла `bounds`. */
function containerBox(map: L.Map, bounds: L.LatLngBounds): L.Bounds {
  return L.bounds(cornersOf(bounds).map((corner) => map.latLngToContainerPoint(corner)));
}

/**
 * Часть карты за вычетом отступов по краям — в координатах карты, по всем
 * четырём углам: у повёрнутой карты два угла экрана не задают прямоугольник.
 */
export function viewBoundsOf(map: L.Map, insets = { top: 0, right: 0, bottom: 0, left: 0 }): L.LatLngBounds {
  const size = map.getSize();
  const left = insets.left;
  const right = size.x - insets.right;
  const top = insets.top;
  const bottom = size.y - insets.bottom;
  return L.latLngBounds([
    map.containerPointToLatLng([left, top]),
    map.containerPointToLatLng([right, top]),
    map.containerPointToLatLng([right, bottom]),
    map.containerPointToLatLng([left, bottom]),
  ]);
}

/** Сколько длится поворот к северу по компасу и доводка после жеста, мс. */
const ROTATE_DURATION_MS = 300;

const rotations = new WeakMap<L.Map, number>();

/**
 * Ставит угол карты, удерживая точку контейнера `anchor` над тем же местом:
 * жест поворачивает карту вокруг пальцев, компас — вокруг центра. Слои
 * перерисовываются, как на кадре масштаба (`zoom`).
 */
export function applyBearing(map: L.Map, degrees: number, anchor: L.Point = map.getSize().divideBy(2)): void {
  const projection = projectionOf(map);
  if (!projection) return;
  const bearing = normalizeBearing(degrees);
  if (bearing === projection.bearing) return;

  const anchorLatLng = map.containerPointToLatLng(anchor);
  projection.bearing = bearing;
  const zoom = map.getZoom();
  mapInternals(map)._move(centerKeeping(map, anchorLatLng, anchor, zoom), zoom, { pinch: true });
  map.fire('rotate');
}

/**
 * Только угол проекции, без перерисовки: жест ставит угол и масштаб вместе и
 * двигает карту одним кадром.
 */
export function setProjectionBearing(map: L.Map, degrees: number): void {
  const projection = projectionOf(map);
  if (projection) projection.bearing = normalizeBearing(degrees);
}

/** Останавливает плавный поворот там, где карта сейчас. */
export function stopRotation(map: L.Map): void {
  const frame = rotations.get(map);
  if (frame === undefined) return;
  cancelAnimationFrame(frame);
  rotations.delete(map);
  mapInternals(map)._moveEnd(false);
  map.fire('rotateend');
}

/** Плавно поворачивает карту к углу `degrees` кратчайшим путём — вокруг центра. */
export function rotateTo(map: L.Map, degrees: number): void {
  const projection = projectionOf(map);
  if (!projection) return;
  stopRotation(map);

  const from = projection.bearing;
  const turn = angleDelta(from, normalizeBearing(degrees));
  const internals = mapInternals(map);
  if (Math.abs(turn) < 1e-6) {
    map.fire('rotateend');
    return;
  }

  internals._stop();
  internals._moveStart(false, false);
  if (prefersReducedMotion()) {
    applyBearing(map, from + turn);
    internals._moveEnd(false);
    map.fire('rotateend');
    return;
  }

  const start = performance.now();
  const step = (now: number) => {
    const progress = Math.min(1, (now - start) / ROTATE_DURATION_MS);
    applyBearing(map, from + turn * (1 - (1 - progress) ** 3));
    if (progress < 1) {
      rotations.set(map, requestAnimationFrame(step));
      return;
    }
    rotations.delete(map);
    internals._moveEnd(false);
    map.fire('rotateend');
  };
  rotations.set(map, requestAnimationFrame(step));
}

interface DragInternals {
  _draggable?: L.Evented;
  _offsetLimit: L.Bounds | null;
  _onDragStart(): void;
}

/**
 * Расчёты Leaflet по прямоугольнику карты — по четырём углам. Возвращает
 * функцию, которая возвращает штатные.
 */
export function installRotationBoundsMath(map: L.Map): () => void {
  const internals = mapInternals(map);
  const original = {
    getBounds: map.getBounds,
    getBoundsZoom: map.getBoundsZoom,
    centerZoom: internals._getBoundsCenterZoom,
    offset: internals._getBoundsOffset,
  };

  map.getBounds = () => viewBoundsOf(map);

  map.getBoundsZoom = (boundsLike: L.LatLngBoundsExpression, inside?: boolean, padding?: L.PointExpression) => {
    const zoom = map.getZoom() || 0;
    const size = map.getSize().subtract(L.point(padding ?? [0, 0]));
    const box = projectedBox(map, toBounds(boundsLike), zoom).getSize();
    const scaleX = size.x / box.x;
    const scaleY = size.y / box.y;
    const fitted = map.getScaleZoom(inside ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY), zoom);
    return Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), fitted));
  };

  internals._getBoundsCenterZoom = (bounds, options = {}) => {
    const paddingTopLeft = L.point(options.paddingTopLeft ?? options.padding ?? [0, 0]);
    const paddingBottomRight = L.point(options.paddingBottomRight ?? options.padding ?? [0, 0]);
    let zoom = map.getBoundsZoom(bounds, false, paddingTopLeft.add(paddingBottomRight));
    if (typeof options.maxZoom === 'number') zoom = Math.min(options.maxZoom, zoom);
    if (zoom === Infinity) return { center: bounds.getCenter(), zoom };

    const offset = paddingBottomRight.subtract(paddingTopLeft).divideBy(2);
    return { center: map.unproject(projectedBox(map, bounds, zoom).getCenter().add(offset), zoom), zoom };
  };

  internals._getBoundsOffset = (pxBounds, maxBounds, zoom) => {
    const projected = projectedBox(map, maxBounds, zoom);
    const minOffset = projected.min!.subtract(pxBounds.min!);
    const maxOffset = projected.max!.subtract(pxBounds.max!);
    return L.point(internals._rebound(minOffset.x, -maxOffset.x), internals._rebound(minOffset.y, -maxOffset.y));
  };

  // Предел вязкого перетаскивания за край — тоже по четырём углам. Обработчик
  // подписан на перетаскивание при создании карты: подписка заменяется.
  const dragging = map.dragging as unknown as DragInternals;
  const originalDragStart = dragging._onDragStart;
  const dragStart = function (this: DragInternals) {
    originalDragStart.call(this);
    const maxBounds = map.options.maxBounds;
    if (!this._offsetLimit || !maxBounds) return;
    const box = containerBox(map, toBounds(maxBounds));
    this._offsetLimit = L.bounds(box.min!.multiplyBy(-1), box.max!.multiplyBy(-1).add(map.getSize()));
  };
  dragging._draggable?.off('dragstart', originalDragStart, dragging).on('dragstart', dragStart, dragging);

  return () => {
    map.getBounds = original.getBounds;
    map.getBoundsZoom = original.getBoundsZoom;
    internals._getBoundsCenterZoom = original.centerZoom;
    internals._getBoundsOffset = original.offset;
    dragging._draggable?.off('dragstart', dragStart, dragging).on('dragstart', originalDragStart, dragging);
  };
}
