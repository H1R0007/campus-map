import { useUpdateStore } from '../stores/updateStore';

/**
 * Как часто открытое приложение спрашивает, нет ли новой версии. Установленный
 * навигатор держат открытым днями, а без проверки браузер узнаёт об обновлении
 * только при следующем открытии.
 */
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Регистрирует service worker и сообщает о новой версии, не перезагружая
 * страницу (запись 27).
 *
 * Своя регистрация, а не модуль `vite-plugin-pwa`: тот тянет `workbox-window`,
 * а здесь достаточно стандартного API. Только в прод-сборке: в dev файла
 * service worker нет, и регистрация падала бы с 404.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;

  const base = import.meta.env.BASE_URL;
  let reloading = false;

  // Смена управляющего service worker после «Обновить» — перезагрузка на новую
  // версию. Первая установка страницу под управление не берёт и сюда не попадает.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!useUpdateStore.getState().applying || reloading) return;
    reloading = true;
    window.location.reload();
  });

  const register = () => {
    navigator.serviceWorker
      .register(`${base}sw.js`, { scope: base })
      .then((registration) => {
        // Ждущая версия без управляющей — это первая установка, а не обновление.
        const offer = (worker: ServiceWorker | null) => {
          if (worker !== null && navigator.serviceWorker.controller !== null) {
            useUpdateStore.getState().offer(worker);
          }
        };

        offer(registration.waiting);
        registration.addEventListener('updatefound', () => {
          const installing = registration.installing;
          installing?.addEventListener('statechange', () => {
            if (installing.state === 'installed') offer(installing);
          });
        });

        setInterval(() => {
          registration.update().catch(() => {
            // Без связи проверка не удалась — попробуем через час.
          });
        }, UPDATE_CHECK_INTERVAL_MS);
      })
      .catch((error: unknown) => {
        console.warn('[campus-map] service worker не зарегистрирован', error);
      });
  };

  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
