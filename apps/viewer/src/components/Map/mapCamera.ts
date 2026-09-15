import type L from 'leaflet';
import { flyToBounds } from '@campus-map/mapkit';

/** Подгонка вида, отложенная до кадра. */
interface PendingFit {
  bounds: L.LatLngBounds;
  options: L.FitBoundsOptions;
  onMoveEnd?: () => void;
}

interface MapInternals {
  _getBoundsCenterZoom(bounds: L.LatLngBounds, options: L.FitBoundsOptions): { center: L.LatLng; zoom: number };
}

const pending = new WeakMap<L.Map, PendingFit>();

/** Номер последнего заказанного перелёта у каждой занятой камеры. */
const busy = new WeakMap<L.Map, number>();
let lastFlight = 0;

/** Отписки текущего перелёта: новый перелёт снимает их у прежнего. */
const cleanups = new WeakMap<L.Map, () => void>();

/** Событие карты: заказанный перелёт закончился — или его прервал человек. */
export const CAMERA_SETTLED = 'camerasettled';

/**
 * Занята ли камера перелётом. Пока занята, промежуточные `moveend` о виде ничего
 * не говорят: вид ещё не тот, куда летит камера.
 */
export function isCameraBusy(map: L.Map): boolean {
  return busy.has(map);
}

/**
 * Перелёт к границам — один на кадр, выполняется последний заказанный.
 *
 * В одном обновлении камеру могут двигать двое: `CanvasCamera` — к месту или
 * корпусу, слой маршрута — к маршруту. Второй перелёт прерывал бы первый в самом
 * начале — лишний рывок; выполняется только последний (записи 32 и 33).
 *
 * @param onMoveEnd вызывается, когда карта встала на место; у прерванного
 *        человеком перелёта не вызывается
 */
export function fitSoon(map: L.Map, bounds: L.LatLngBounds, options: L.FitBoundsOptions, onMoveEnd?: () => void): void {
  const scheduled = pending.has(map);
  pending.set(map, { bounds, options, onMoveEnd });
  lastFlight += 1;
  busy.set(map, lastFlight);
  if (scheduled) return;

  requestAnimationFrame(() => run(map));
}

function run(map: L.Map): void {
  const fit = pending.get(map);
  const flight = busy.get(map);
  pending.delete(map);
  if (!fit || flight === undefined) return;

  cleanups.get(map)?.();
  const container = map.getContainer();
  let expectedZoom: number | null = null;

  const unsubscribe = () => {
    map.off('moveend', onMoveEnd);
    map.off('dragstart', onGesture);
    container.removeEventListener('wheel', onGesture);
    container.removeEventListener('touchstart', onGesture);
    if (cleanups.get(map) === unsubscribe) cleanups.delete(map);
  };

  const finish = (arrived: boolean) => {
    unsubscribe();
    // Заказан новый перелёт — камеру освободит он.
    if (busy.get(map) !== flight) return;
    busy.delete(map);
    if (arrived) fit.onMoveEnd?.();
    map.fire(CAMERA_SETTLED);
  };

  // Перелёт кончается своим `moveend` на целевом масштабе. Промежуточные
  // `moveend` приходят и во время перелёта — по ним вид «после подгонки»
  // записывался на полпути, и раскрытая шторка потом считала карту сдвинутой
  // человеком.
  const onMoveEnd = () => {
    if (expectedZoom === null || Math.abs(map.getZoom() - expectedZoom) < 1e-6) finish(true);
  };

  // Человек перехватил карту — перелёт прерван, вида после подгонки не будет.
  const onGesture = () => finish(false);

  try {
    // Тот же расчёт, которым пользуется `flyToBounds`: перелёт встаёт ровно на этот масштаб.
    expectedZoom = (map as unknown as MapInternals)._getBoundsCenterZoom(fit.bounds, fit.options).zoom;
    if (!flyToBounds(map, fit.bounds, fit.options)) {
      finish(true);
      return;
    }
    map.on('moveend', onMoveEnd);
    map.on('dragstart', onGesture);
    container.addEventListener('wheel', onGesture, { passive: true });
    container.addEventListener('touchstart', onGesture, { passive: true });
    cleanups.set(map, unsubscribe);
  } catch {
    // Карта снята с экрана или у контейнера нулевой размер — подгонять не к чему.
    finish(false);
  }
}
