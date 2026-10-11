import { useEffect } from 'react';
import { useMapStore } from '../stores/mapStore';
import { routePhotoUrls } from '../utils/photos';
import { useOnline } from './useOnline';
import { useRouteSteps } from './useStepNavigation';

/** Фото, уже запрошенные заранее в этой вкладке. */
const requested = new Set<string>();

/**
 * Маленькие фото шагов построенного маршрута загружаются заранее, пока есть
 * связь (запись 85) — как планы этажей маршрута (запись 26).
 *
 * Шаг у кофейного автомата нужен там, где человек уже идёт, — на лестнице и в
 * подвале, где связи может не быть. Запрос проходит через service worker и
 * попадает в кэш фото. Полные фото заранее не грузятся: их открывают по
 * нажатию, а весят они в разы больше. Не удалось — фото запросится снова со
 * следующим маршрутом.
 */
export function usePrefetchRoutePhotos(): void {
  const graph = useMapStore((s) => s.graph);
  const steps = useRouteSteps();
  const online = useOnline();

  useEffect(() => {
    if (!graph || steps.length === 0 || !online) return;

    for (const url of routePhotoUrls(graph, steps.map((step) => step.subject))) {
      if (requested.has(url)) continue;
      requested.add(url);

      fetch(url)
        .then((response) => response.arrayBuffer())
        .catch(() => requested.delete(url));
    }
  }, [graph, steps, online]);
}
