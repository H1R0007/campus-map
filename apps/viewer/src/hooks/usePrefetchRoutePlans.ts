import { useEffect } from 'react';
import { DATA_BASE_URL } from '../config/dataBase';
import { useMapStore } from '../stores/mapStore';
import { useRouteStore } from '../stores/routeStore';
import { routePlanUrls } from '../utils/routePlans';
import { useOnline } from './useOnline';

/** Планы, уже запрошенные заранее в этой вкладке. */
const requested = new Set<string>();

/**
 * Планы этажей построенного маршрута загружаются заранее, пока есть связь
 * (запись 26).
 *
 * Service worker кэширует план при первой загрузке, а до этого — только
 * открытые этажи. Маршрут строят у входа, где связь есть, а идут по нему через
 * лестницы и подвалы, где её нет: план следующего этажа не открылся бы ровно
 * тогда, когда он нужен. Запрос проходит через service worker и попадает в тот
 * же кэш планов. Не удался — план запросится снова со следующим маршрутом.
 */
export function usePrefetchRoutePlans(): void {
  const graph = useMapStore((s) => s.graph);
  const route = useRouteStore((s) => s.currentRoute);
  const online = useOnline();

  useEffect(() => {
    if (!graph || !route?.found || !online) return;

    for (const url of routePlanUrls(graph, route.path, DATA_BASE_URL)) {
      if (requested.has(url)) continue;
      requested.add(url);

      fetch(url)
        .then((response) => response.arrayBuffer())
        .catch(() => requested.delete(url));
    }
  }, [graph, route, online]);
}
