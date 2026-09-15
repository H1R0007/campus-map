import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { approachZoom, wheelZoomDelta } from './zoomMotion.js';

/**
 * Плавная камера карт mapkit (запись 33).
 *
 * Штатный масштаб Leaflet — CSS-анимация: слои растягиваются картинкой и
 * перерисовываются в конце, поэтому точки и линии увеличивались, а потом
 * «прыгали» к своему размеру; колесо шагало ступеньками, а переход с большим
 * сдвигом Leaflet не анимирует вовсе — вид перескакивал. Здесь камера движется
 * покадрово: каждый кадр — настоящий вид карты, и слои сразу на месте.
 *
 * Опирается на внутренние методы Leaflet (`_move`, `_moveStart`, `_moveEnd`,
 * `_stop`, `_reset` у рендереров) — те же, на которых стоят его `flyTo` и жест
 * щипка. При обновлении Leaflet камеру нужно проверить.
 */

interface MapInternals {
  _move(center: L.LatLng, zoom: number): void;
  _moveStart(zoomChanged: boolean, noMoveStart: boolean): void;
  _moveEnd(zoomChanged: boolean): void;
  _stop(): void;
  _layers: Record<string, L.Layer>;
}

const internalsOf = (map: L.Map) => map as unknown as MapInternals;

/** Длительность перелёта к корпусу, месту или маршруту, секунды. */
export const FLY_DURATION_S = 0.6;

/** Просил ли человек систему не анимировать интерфейс. */
export const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;

interface ZoomMotion {
  target: number;
  anchor: L.Point;
  anchorLatLng: L.LatLng;
  frame: number;
  time: number;
}

const motions = new WeakMap<L.Map, ZoomMotion>();

const moving = new WeakSet<L.Map>();

/** Движется ли карта — между `movestart` и `moveend`: перелёт, жест, плавный масштаб. */
export function isMapMoving(map: L.Map): boolean {
  return moving.has(map);
}

/** Центр, при котором место `latlng` на масштабе `zoom` стоит в точке контейнера `point`. */
export function centerKeeping(map: L.Map, latlng: L.LatLng, point: L.Point, zoom: number): L.LatLng {
  const offset = point.subtract(map.getSize().divideBy(2));
  return map.unproject(map.project(latlng, zoom).subtract(offset), zoom);
}

/** Масштаб, к которому карта сейчас движется, а без движения — текущий. */
export function targetZoomOf(map: L.Map): number {
  return motions.get(map)?.target ?? map.getZoom();
}

/** Останавливает плавное масштабирование там, где карта сейчас. */
export function stopZoomMotion(map: L.Map): void {
  const motion = motions.get(map);
  if (!motion) return;

  cancelAnimationFrame(motion.frame);
  motions.delete(map);
  try {
    internalsOf(map)._moveEnd(true);
  } catch {
    // Карта уже снята с экрана — сообщать об окончании движения некому.
  }
}

/**
 * Плавно ведёт масштаб к `zoom`, удерживая точку контейнера `anchor` над тем же
 * местом карты — под курсором, пальцем или центром экрана. Вызов во время
 * движения меняет цель, а не начинает движение заново: частая прокрутка колеса
 * сливается в одно движение.
 */
export function zoomSmoothly(map: L.Map, zoom: number, anchor: L.Point): void {
  const target = Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), zoom));
  const anchorLatLng = map.containerPointToLatLng(anchor);

  const running = motions.get(map);
  if (running) {
    Object.assign(running, { target, anchor, anchorLatLng });
    return;
  }

  if (prefersReducedMotion()) {
    map.setZoomAround(anchor, target, { animate: false });
    return;
  }

  const internals = internalsOf(map);
  internals._stop();
  internals._moveStart(true, false);

  const motion: ZoomMotion = { target, anchor, anchorLatLng, frame: 0, time: performance.now() };
  motions.set(map, motion);

  const step = (now: number) => {
    const next = approachZoom(map.getZoom(), motion.target, now - motion.time);
    motion.time = now;
    internals._move(centerKeeping(map, motion.anchorLatLng, motion.anchor, next), next);

    if (next === motion.target) {
      motions.delete(map);
      internals._moveEnd(true);
      return;
    }
    motion.frame = requestAnimationFrame(step);
  };
  motion.frame = requestAnimationFrame(step);
}

/**
 * Перелёт к границам: сдвиг и масштаб одним плавным движением.
 *
 * @returns идёт ли анимация: без неё карта уже на месте, и `moveend` прошёл
 */
export function flyToBounds(map: L.Map, bounds: L.LatLngBounds, options: L.FitBoundsOptions): boolean {
  stopZoomMotion(map);
  if (prefersReducedMotion()) {
    map.fitBounds(bounds, { ...options, animate: false });
    return false;
  }
  map.flyToBounds(bounds, { ...options, duration: FLY_DURATION_S });
  return true;
}

/** Колесо мыши и щипок тачпада — плавным масштабом вместо ступенек. */
class SmoothWheelZoom extends L.Handler {
  constructor(private readonly target: L.Map) {
    super(target);
  }

  override addHooks(): void {
    this.target.getContainer().addEventListener('wheel', this.onWheel, { passive: false });
  }

  override removeHooks(): void {
    this.target.getContainer().removeEventListener('wheel', this.onWheel);
  }

  private readonly onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const delta = wheelZoomDelta(event);
    if (delta !== 0) zoomSmoothly(this.target, targetZoomOf(this.target) + delta, this.target.mouseEventToContainerPoint(event));
  };
}

/** Двойное нажатие — плавное приближение на уровень, с Shift — отдаление. */
class SmoothDoubleClickZoom extends L.Handler {
  constructor(private readonly target: L.Map) {
    super(target);
  }

  override addHooks(): void {
    this.target.on('dblclick', this.onDoubleClick, this);
  }

  override removeHooks(): void {
    this.target.off('dblclick', this.onDoubleClick, this);
  }

  private onDoubleClick(event: L.LeafletMouseEvent): void {
    const zoomOut = (event.originalEvent as MouseEvent).shiftKey;
    zoomSmoothly(this.target, targetZoomOf(this.target) + (zoomOut ? -1 : 1), event.containerPoint);
  }
}

/**
 * Рендереры векторных слоёв — линии и точки canvas — перерисовываются на каждом
 * кадре масштаба. Штатно Leaflet растягивает их картинкой до конца движения.
 */
function redrawRenderers(map: L.Map): void {
  for (const layer of Object.values(internalsOf(map)._layers)) {
    if (!(layer instanceof L.Renderer)) continue;
    const renderer = layer as unknown as { _reset(): void; _redraw?: () => void };
    renderer._reset();
    // Canvas очищается при обновлении, а рисует в следующем кадре: без
    // немедленной отрисовки точки мигали бы.
    renderer._redraw?.();
  }
}

/**
 * Рендереры, чья область отрисовки уже не покрывает экран, обновляются по ходу
 * перетаскивания. Штатно Leaflet обновляет их только по окончании движения, и
 * всё за краем прежней области — крыши, линии, точки — оставалось обрезанным,
 * пока палец на экране. Проверка дешёвая, а обновление — только когда экран
 * действительно вышел за край: на телефоне это раз в полэкрана движения.
 */
function refreshUncoveredRenderers(map: L.Map): void {
  const topLeft = map.containerPointToLayerPoint([0, 0]);
  const view = L.bounds(topLeft, topLeft.add(map.getSize()));
  for (const layer of Object.values(internalsOf(map)._layers)) {
    if (!(layer instanceof L.Renderer)) continue;
    const renderer = layer as unknown as { _bounds?: L.Bounds; _update(): void; _redraw?: () => void };
    if (renderer._bounds?.contains(view)) continue;
    renderer._update();
    renderer._redraw?.();
  }
}

function installSmoothCamera(map: L.Map, doubleClickZoom: boolean): () => void {
  const wheel = new SmoothWheelZoom(map).enable();
  const doubleClick = doubleClickZoom ? new SmoothDoubleClickZoom(map).enable() : null;
  const redraw = () => redrawRenderers(map);
  const yieldToGesture = () => stopZoomMotion(map);
  const container = map.getContainer();

  const markMoving = () => moving.add(map);
  const markStill = () => moving.delete(map);
  map.on('movestart', markMoving);
  map.on('moveend', markStill);
  map.on('zoom', redraw);
  // Не чаще кадра: мышь и палец присылают движения чаще, чем экран обновляется.
  let moveFrame = 0;
  const refreshOnMove = () => {
    if (moveFrame !== 0) return;
    moveFrame = requestAnimationFrame(() => {
      moveFrame = 0;
      refreshUncoveredRenderers(map);
    });
  };
  map.on('move', refreshOnMove);
  // Палец или перетаскивание во время плавного масштаба забирают камеру себе.
  map.on('dragstart', yieldToGesture);
  container.addEventListener('touchstart', yieldToGesture, { passive: true });

  // Штатные кнопки масштаба Leaflet (в редакторе) и любые вызовы zoomIn/zoomOut —
  // тем же плавным движением вокруг центра карты.
  const { zoomIn, zoomOut } = map;
  map.zoomIn = ((delta = 1) => {
    zoomSmoothly(map, targetZoomOf(map) + delta, map.getSize().divideBy(2));
    return map;
  }) as L.Map['zoomIn'];
  map.zoomOut = ((delta = 1) => {
    zoomSmoothly(map, targetZoomOf(map) - delta, map.getSize().divideBy(2));
    return map;
  }) as L.Map['zoomOut'];

  return () => {
    wheel.disable();
    doubleClick?.disable();
    map.off('movestart', markMoving);
    map.off('moveend', markStill);
    moving.delete(map);
    map.off('zoom', redraw);
    map.off('move', refreshOnMove);
    cancelAnimationFrame(moveFrame);
    map.off('dragstart', yieldToGesture);
    container.removeEventListener('touchstart', yieldToGesture);
    stopZoomMotion(map);
    map.zoomIn = zoomIn;
    map.zoomOut = zoomOut;
  };
}

/** Подключает плавную камеру к карте; рендерится внутри `MapContainer`. */
export function SmoothCamera({ doubleClickZoom }: { doubleClickZoom: boolean }) {
  const map = useMap();
  useEffect(() => installSmoothCamera(map, doubleClickZoom), [map, doubleClickZoom]);
  return null;
}
