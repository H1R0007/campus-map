import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import { useUiStore } from '../../stores/uiStore';

/** Через столько после того, как карту отпустили, шторка возвращается, мс: без паузы она мигала бы между касаниями. */
const RETURN_DELAY_MS = 250;

/**
 * Следит, двигает ли человек карту сам — пальцем, мышью, щипком или поворотом
 * (запись 37). Пока двигает, шторка на телефоне уступает место карте.
 *
 * Жест — это нажатие на карту и движение карты под ним. Перелёт камеры к месту
 * или маршруту без нажатия жестом не считается: шторка не должна уезжать сама,
 * когда человек только выбрал место. Нажатия отслеживаются на `window` в фазе
 * перехвата: поворот мышью останавливает событие на контейнере карты, и до
 * самой карты оно не доходит.
 *
 * Должен рендериться внутри карты.
 */
export function MapGestureWatch() {
  const map = useMap();
  const setMapGesture = useUiStore((s) => s.setMapGesture);

  useEffect(() => {
    const container = map.getContainer();
    const pointers = new Set<number>();
    let returnTimer = 0;

    const onDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || !container.contains(event.target)) return;
      pointers.add(event.pointerId);
      window.clearTimeout(returnTimer);
    };
    const onUp = (event: PointerEvent) => {
      if (!pointers.delete(event.pointerId) || pointers.size > 0) return;
      window.clearTimeout(returnTimer);
      returnTimer = window.setTimeout(() => setMapGesture(false), RETURN_DELAY_MS);
    };
    const onMove = () => {
      if (pointers.size > 0) setMapGesture(true);
    };

    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onUp, true);
    map.on('move', onMove);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onUp, true);
      map.off('move', onMove);
      window.clearTimeout(returnTimer);
      setMapGesture(false);
    };
  }, [map, setMapGesture]);

  return null;
}
