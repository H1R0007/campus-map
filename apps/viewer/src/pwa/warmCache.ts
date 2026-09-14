import { DATA_BASE_URL } from '../config/dataBase';

/**
 * Дозагружает в кэш service worker то, что страница успела загрузить до него
 * (запись 26).
 *
 * При первом открытии service worker устанавливается уже после загрузки данных
 * и планов: эти запросы шли мимо него и в кэш не попали, и без связи навигатор
 * не открылся бы до следующего визита. Когда service worker берёт страницу под
 * управление, файлы данных, которые страница уже запрашивала, — JSON датасета,
 * открытые и заранее запрошенные планы — запрашиваются ещё раз, теперь через
 * него.
 */
export function warmCacheWhenControlled(): void {
  if (!('serviceWorker' in navigator) || navigator.serviceWorker.controller !== null) return;

  navigator.serviceWorker.addEventListener(
    'controllerchange',
    () => {
      const dataPath = new URL(`${DATA_BASE_URL}/`, window.location.href).pathname;
      const urls = new Set(
        performance
          .getEntriesByType('resource')
          .map((entry) => entry.name)
          .filter((name) => new URL(name).pathname.startsWith(dataPath))
      );

      for (const url of urls) {
        fetch(url)
          .then((response) => response.arrayBuffer())
          .catch(() => {
            // Связь пропала — файл попадёт в кэш при следующем открытии.
          });
      }
    },
    { once: true }
  );
}
