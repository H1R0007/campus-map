import type L from 'leaflet';
import type { MapView } from '@campus-map/mapkit';

/**
 * Что окна карт помнят вне стора (запись 66): это не данные и не то, что
 * рисует интерфейс, а состояние самих карт Leaflet.
 *
 * - вид вкладки — где её оставили: переключились обратно, и план на том же
 *   месте в том же масштабе;
 * - живые карты по индексу окна — для пунктира перехода между картами.
 */

interface RememberedView extends MapView {
  /** План и его файл: вид другого плана или сменившейся картинки не годится. */
  planKey: string;
}

const views = new Map<string, RememberedView>();

export function rememberView(tabId: string, planKey: string, view: MapView): void {
  views.set(tabId, { ...view, planKey });
}

/** Вид вкладки, если он запомнен для этого же плана. */
export function recalledView(tabId: string, planKey: string): MapView | null {
  const view = views.get(tabId);
  return view && view.planKey === planKey ? { x: view.x, y: view.y, zoom: view.zoom } : null;
}

const maps = new Map<number, L.Map>();
const listeners = new Set<() => void>();

export function registerMap(group: number, map: L.Map | null): void {
  if (map) maps.set(group, map);
  else maps.delete(group);
  for (const listener of listeners) listener();
}

export const mapOfGroup = (group: number): L.Map | undefined => maps.get(group);

/** Подписка на появление и исчезновение карт; возвращает отписку. */
export function onMapsChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
