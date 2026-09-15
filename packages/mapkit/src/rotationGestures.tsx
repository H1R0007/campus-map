import { useEffect, useState } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { ROTATE_THRESHOLD_DEG, angleDelta, settledBearing, touchAngle } from './bearing.js';
import {
  applyBearing,
  bearingOf,
  installRotationBoundsMath,
  mapInternals,
  rotateTo,
  setProjectionBearing,
  stopRotation,
} from './rotatingCrs.js';
import { centerKeeping, stopZoomMotion } from './smoothCamera.js';

/**
 * Жесты поворота холста (запись 36).
 *
 * - Два пальца — щипок и поворот одним жестом. Штатный щипок Leaflet заменён:
 *   о повороте он не знает. Поворот начинается, когда угол между пальцами
 *   изменился на `ROTATE_THRESHOLD_DEG`, — обычный щипок карту не крутит.
 * - Мышь — перетаскивание правой кнопкой или с Alt, поворот вокруг центра.
 * - Тачпад Mac в Safari — жест поворота и щипок. Chrome и Edge поворот тачпада
 *   странице не сообщают: там поворот мышью и компасом.
 *
 * Угол у самого севера по окончании жеста доводится ровно до севера.
 */

/** Карта, которую сейчас ведут пальцы: жест Safari на iPhone тогда не повторяет щипок. */
const touchesInProgress = new WeakSet<L.Map>();

/** По окончании жеста — ровно на север, если остановились рядом с ним. */
function settle(map: L.Map): void {
  const bearing = bearingOf(map);
  const settled = settledBearing(bearing);
  if (settled !== bearing) rotateTo(map, settled);
  else map.fire('rotateend');
}

const clampZoom = (map: L.Map, zoom: number) => Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), zoom));

interface TouchGesture {
  startDistance: number;
  startZoom: number;
  startAngle: number;
  startBearing: number;
  pinchLatLng: L.LatLng;
  rotating: boolean;
  moved: boolean;
  bearing: number;
  zoom: number;
  middle: L.Point;
  center: L.LatLng;
}

/** Щипок и поворот двумя пальцами. */
class TouchZoomRotate extends L.Handler {
  private gesture: TouchGesture | null = null;
  private frame = 0;

  constructor(private readonly target: L.Map) {
    super(target);
  }

  override addHooks(): void {
    this.target.getContainer().addEventListener('touchstart', this.onStart, { passive: false });
  }

  override removeHooks(): void {
    this.target.getContainer().removeEventListener('touchstart', this.onStart);
    this.finish(false);
  }

  private points(event: TouchEvent): [L.Point, L.Point] {
    const map = this.target;
    return [
      map.mouseEventToContainerPoint(event.touches[0] as unknown as MouseEvent),
      map.mouseEventToContainerPoint(event.touches[1] as unknown as MouseEvent),
    ];
  }

  private readonly onStart = (event: TouchEvent): void => {
    if (event.touches.length !== 2 || this.gesture) return;
    const map = this.target;
    const [a, b] = this.points(event);
    const middle = a.add(b).divideBy(2);

    stopRotation(map);
    stopZoomMotion(map);
    mapInternals(map)._stop();
    this.gesture = {
      startDistance: a.distanceTo(b),
      startZoom: map.getZoom(),
      startAngle: touchAngle(a, b),
      startBearing: bearingOf(map),
      pinchLatLng: map.containerPointToLatLng(middle),
      rotating: false,
      moved: false,
      bearing: bearingOf(map),
      zoom: map.getZoom(),
      middle,
      center: map.getCenter(),
    };
    touchesInProgress.add(map);
    document.addEventListener('touchmove', this.onMove, { passive: false });
    document.addEventListener('touchend', this.onEnd);
    document.addEventListener('touchcancel', this.onEnd);
    event.preventDefault();
  };

  private readonly onMove = (event: TouchEvent): void => {
    const gesture = this.gesture;
    if (!gesture || event.touches.length !== 2) return;
    const map = this.target;
    const [a, b] = this.points(event);
    const angle = touchAngle(a, b);

    if (!gesture.rotating && Math.abs(angleDelta(gesture.startAngle, angle)) >= ROTATE_THRESHOLD_DEG) {
      // Поворот начинается отсюда: без скачка на пройденный порог.
      gesture.rotating = true;
      gesture.startAngle = angle;
    }
    if (gesture.rotating) gesture.bearing = gesture.startBearing + angleDelta(gesture.startAngle, angle);
    gesture.zoom = clampZoom(map, map.getScaleZoom(a.distanceTo(b) / gesture.startDistance, gesture.startZoom));
    gesture.middle = a.add(b).divideBy(2);

    if (!gesture.moved) {
      mapInternals(map)._moveStart(true, false);
      gesture.moved = true;
    }
    if (this.frame === 0) {
      this.frame = requestAnimationFrame(() => {
        this.frame = 0;
        this.render();
      });
    }
    event.preventDefault();
  };

  /** Кадр жеста: угол, масштаб и место под пальцами — одним движением карты. */
  private render(): void {
    const gesture = this.gesture;
    if (!gesture) return;
    const map = this.target;
    setProjectionBearing(map, gesture.bearing);
    gesture.center = centerKeeping(map, gesture.pinchLatLng, gesture.middle, gesture.zoom);
    mapInternals(map)._move(gesture.center, gesture.zoom, { pinch: true, round: false });
    if (gesture.rotating) map.fire('rotate');
  }

  private readonly onEnd = (event: TouchEvent): void => {
    if (this.gesture && event.touches.length < 2) this.finish(true);
  };

  private finish(settleView: boolean): void {
    const gesture = this.gesture;
    if (!gesture) return;
    const map = this.target;
    if (this.frame !== 0) {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
      this.render();
    }
    this.gesture = null;
    touchesInProgress.delete(map);
    document.removeEventListener('touchmove', this.onMove);
    document.removeEventListener('touchend', this.onEnd);
    document.removeEventListener('touchcancel', this.onEnd);
    if (!gesture.moved || !settleView) return;

    // Как у штатного щипка без анимации масштаба: вид фиксируется, слои встают на место.
    const internals = mapInternals(map);
    internals._resetView(gesture.center, internals._limitZoom(gesture.zoom));
    if (gesture.rotating) settle(map);
  }
}

/** Ближе к центру карты, чем на столько пикселей, угол курсора скачет: движение там не поворачивает. */
const MOUSE_DEAD_ZONE_PX = 24;

interface MouseDrag {
  pointerId: number;
  startAngle: number | null;
  startBearing: number;
  rightButton: boolean;
  moved: boolean;
}

/** Поворот мышью: перетаскивание правой кнопкой или с Alt — вокруг центра карты. */
class MouseRotate extends L.Handler {
  private drag: MouseDrag | null = null;
  private suppressMenu = false;

  constructor(private readonly target: L.Map) {
    super(target);
  }

  override addHooks(): void {
    const container = this.target.getContainer();
    container.addEventListener('pointerdown', this.onDown, true);
    container.addEventListener('contextmenu', this.onContextMenu, true);
  }

  override removeHooks(): void {
    const container = this.target.getContainer();
    container.removeEventListener('pointerdown', this.onDown, true);
    container.removeEventListener('contextmenu', this.onContextMenu, true);
    this.end();
  }

  private angleAt(event: PointerEvent): number | null {
    const map = this.target;
    const point = map.mouseEventToContainerPoint(event);
    const center = map.getSize().divideBy(2);
    return point.distanceTo(center) < MOUSE_DEAD_ZONE_PX ? null : touchAngle(center, point);
  }

  private readonly onDown = (event: PointerEvent): void => {
    if (event.pointerType !== 'mouse' || this.drag) return;
    const rightButton = event.button === 2;
    if (!rightButton && !(event.button === 0 && event.altKey)) return;

    // Отменённое нажатие не превращается в mousedown, которого ждёт
    // перетаскивание Leaflet: карта поворачивается, а не сдвигается.
    event.preventDefault();
    event.stopImmediatePropagation();
    const map = this.target;
    const container = map.getContainer();
    container.setPointerCapture(event.pointerId);
    this.drag = { pointerId: event.pointerId, startAngle: this.angleAt(event), startBearing: bearingOf(map), rightButton, moved: false };
    container.addEventListener('pointermove', this.onMove);
    container.addEventListener('pointerup', this.onUp);
    container.addEventListener('pointercancel', this.onUp);
  };

  private readonly onMove = (event: PointerEvent): void => {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const angle = this.angleAt(event);
    if (angle === null) return;
    const map = this.target;

    // Нажали у самого центра — начальный угол задаёт первое движение за его пределами.
    if (drag.startAngle === null) {
      drag.startAngle = angle;
      return;
    }
    if (!drag.moved) {
      if (Math.abs(angleDelta(drag.startAngle, angle)) < 1) return;
      drag.moved = true;
      stopRotation(map);
      stopZoomMotion(map);
      mapInternals(map)._stop();
      mapInternals(map)._moveStart(false, false);
    }
    applyBearing(map, drag.startBearing + angleDelta(drag.startAngle, angle));
  };

  private readonly onUp = (event: PointerEvent): void => {
    if (this.drag && event.pointerId === this.drag.pointerId) this.end();
  };

  private end(): void {
    const drag = this.drag;
    if (!drag) return;
    this.drag = null;
    const container = this.target.getContainer();
    if (container.hasPointerCapture(drag.pointerId)) container.releasePointerCapture(drag.pointerId);
    container.removeEventListener('pointermove', this.onMove);
    container.removeEventListener('pointerup', this.onUp);
    container.removeEventListener('pointercancel', this.onUp);
    if (!drag.moved) return;

    mapInternals(this.target)._moveEnd(false);
    settle(this.target);
    // Windows открывает меню правой кнопки при отпускании — после поворота оно ни к чему.
    if (drag.rightButton) this.suppressMenu = true;
  }

  private readonly onContextMenu = (event: MouseEvent): void => {
    // macOS открывает меню при нажатии: пока правая кнопка ведёт поворот, меню нет.
    if (!this.suppressMenu && !this.drag?.rightButton) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.suppressMenu = false;
  };
}

/** Жест Safari: у события есть угол поворота и масштаб щипка. */
interface SafariGestureEvent extends UIEvent {
  rotation: number;
  scale: number;
  clientX: number;
  clientY: number;
}

interface TrackpadGesture {
  startBearing: number;
  startZoom: number;
  startRotation: number;
  rotating: boolean;
  anchor: L.Point;
}

/** Поворот и щипок тачпада Mac в Safari. */
class TrackpadRotate extends L.Handler {
  private gesture: TrackpadGesture | null = null;

  constructor(private readonly target: L.Map) {
    super(target);
  }

  override addHooks(): void {
    const container = this.target.getContainer();
    container.addEventListener('gesturestart', this.onStart);
    container.addEventListener('gesturechange', this.onChange);
    container.addEventListener('gestureend', this.onEnd);
  }

  override removeHooks(): void {
    const container = this.target.getContainer();
    container.removeEventListener('gesturestart', this.onStart);
    container.removeEventListener('gesturechange', this.onChange);
    container.removeEventListener('gestureend', this.onEnd);
    this.gesture = null;
  }

  private readonly onStart = (event: Event): void => {
    const map = this.target;
    // На iPhone Safari присылает жест и для пальцев — их уже ведёт `TouchZoomRotate`.
    if (touchesInProgress.has(map)) return;
    event.preventDefault();
    const gestureEvent = event as SafariGestureEvent;
    stopRotation(map);
    stopZoomMotion(map);
    mapInternals(map)._stop();
    mapInternals(map)._moveStart(true, false);
    this.gesture = {
      startBearing: bearingOf(map),
      startZoom: map.getZoom(),
      startRotation: gestureEvent.rotation,
      rotating: false,
      anchor: map.mouseEventToContainerPoint(gestureEvent as unknown as MouseEvent),
    };
  };

  private readonly onChange = (event: Event): void => {
    const gesture = this.gesture;
    if (!gesture) return;
    event.preventDefault();
    const gestureEvent = event as SafariGestureEvent;
    const map = this.target;

    if (!gesture.rotating && Math.abs(gestureEvent.rotation - gesture.startRotation) >= ROTATE_THRESHOLD_DEG) {
      gesture.rotating = true;
      gesture.startRotation = gestureEvent.rotation;
    }
    const anchorLatLng = map.containerPointToLatLng(gesture.anchor);
    if (gesture.rotating) setProjectionBearing(map, gesture.startBearing + gestureEvent.rotation - gesture.startRotation);
    const zoom = clampZoom(map, gesture.startZoom + Math.log2(gestureEvent.scale));
    mapInternals(map)._move(centerKeeping(map, anchorLatLng, gesture.anchor, zoom), zoom, { pinch: true });
    if (gesture.rotating) map.fire('rotate');
  };

  private readonly onEnd = (event: Event): void => {
    const gesture = this.gesture;
    if (!gesture) return;
    event.preventDefault();
    this.gesture = null;
    mapInternals(this.target)._moveEnd(true);
    if (gesture.rotating) settle(this.target);
  };
}

function installRotation(map: L.Map): () => void {
  const restoreBoundsMath = installRotationBoundsMath(map);
  const touchZoomWasEnabled = map.touchZoom.enabled();
  map.touchZoom.disable();
  const touch = new TouchZoomRotate(map).enable();
  const mouse = new MouseRotate(map).enable();
  const trackpad = new TrackpadRotate(map).enable();
  // Палец, начавший двигать карту, забирает её и у поворота к северу.
  const yieldToDrag = () => stopRotation(map);
  map.on('dragstart', yieldToDrag);

  return () => {
    map.off('dragstart', yieldToDrag);
    trackpad.disable();
    mouse.disable();
    touch.disable();
    if (touchZoomWasEnabled) map.touchZoom.enable();
    stopRotation(map);
    restoreBoundsMath();
  };
}

/** Поворот карты жестами; рендерится внутри `MapContainer` карты с поворотом. */
export function MapRotation() {
  const map = useMap();
  useEffect(() => installRotation(map), [map]);
  return null;
}

/**
 * Угол карты для интерфейса — компаса. Обновляется не чаще кадра: жест
 * присылает поворот чаще, чем экран перерисовывается.
 */
export function useMapBearing(): number {
  const map = useMap();
  const [bearing, setBearing] = useState(() => bearingOf(map));

  useEffect(() => {
    let frame = 0;
    const update = () => {
      if (frame !== 0) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setBearing(bearingOf(map));
      });
    };
    map.on('rotate rotateend', update);
    return () => {
      map.off('rotate rotateend', update);
      cancelAnimationFrame(frame);
    };
  }, [map]);

  return bearing;
}
