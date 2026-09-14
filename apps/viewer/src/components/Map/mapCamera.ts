import type L from 'leaflet';

/** Подгонка вида, отложенная до кадра. */
interface PendingFit {
  bounds: L.LatLngBounds;
  options: L.FitBoundsOptions;
  onMoveEnd?: () => void;
}

const pending = new WeakMap<L.Map, PendingFit>();

/** Приватные флаги Leaflet: идёт ли анимация масштаба или прокрутки. */
interface MapInternals {
  _animatingZoom?: boolean;
  _panAnim?: { _inProgress?: boolean };
}

function isAnimating(map: L.Map): boolean {
  const internals = map as unknown as MapInternals;
  return Boolean(internals._animatingZoom || internals._panAnim?._inProgress);
}

/**
 * Подгонка вида — одна на кадр, выполняется последняя заказанная.
 *
 * В одном обновлении камеру могут двигать двое: `CanvasCamera` — к месту или
 * корпусу, слой маршрута — к маршруту. Leaflet не принимает новый вид, пока
 * идёт анимация масштаба, и вторая подгонка терялась: карта оставалась там,
 * куда вела первая (запись 32).
 *
 * @param onMoveEnd вызывается, когда карта встанет на место
 */
export function fitSoon(map: L.Map, bounds: L.LatLngBounds, options: L.FitBoundsOptions, onMoveEnd?: () => void): void {
  const scheduled = pending.has(map);
  pending.set(map, { bounds, options, onMoveEnd });
  if (scheduled) return;

  requestAnimationFrame(() => run(map));
}

function run(map: L.Map): void {
  // Во время анимации масштаба Leaflet новый вид не принимает — подгонка ждёт
  // её конца. Флаг приватный; на нём же Leaflet сам решает, принять ли вид.
  if ((map as unknown as MapInternals)._animatingZoom) {
    map.once('zoomend', () => run(map));
    return;
  }

  const fit = pending.get(map);
  pending.delete(map);
  if (!fit) return;

  try {
    map.fitBounds(fit.bounds, fit.options);
    // Конец движения ждётся после вызова, а не до: `fitBounds` останавливает
    // идущую прокрутку, и её `moveend` приходил раньше, чем карта вставала на
    // новое место. Без анимации карта уже на месте.
    if (fit.onMoveEnd) {
      if (isAnimating(map)) map.once('moveend', fit.onMoveEnd);
      else fit.onMoveEnd();
    }
  } catch {
    // Карта снята с экрана или у контейнера нулевой размер — подгонять не к чему.
  }
}
