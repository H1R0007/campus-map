import { create } from 'zustand';

/**
 * Обновление навигатора по согласию человека (запись 27).
 *
 * Новая версия приложения или данных приходит новым service worker. Он
 * устанавливается в фоне и ждёт (`waiting`), пока человек не нажмёт «Обновить»:
 * прежний `autoUpdate` перезагружал страницу сам — в том числе посреди маршрута.
 */
interface UpdateState {
  /** Установленная новая версия, которая ждёт согласия; `null` — обновления нет. */
  waiting: ServiceWorker | null;
  /** Человек отложил обновление в этой вкладке. */
  dismissed: boolean;
  /** «Обновить» нажато: смена service worker — сигнал перезагрузить страницу. */
  applying: boolean;

  offer: (worker: ServiceWorker) => void;
  dismiss: () => void;
  apply: () => void;
}

export const useUpdateStore = create<UpdateState>((set, get) => ({
  waiting: null,
  dismissed: false,
  applying: false,

  offer: (worker) => set({ waiting: worker, dismissed: false }),
  dismiss: () => set({ dismissed: true }),

  apply: () => {
    const { waiting } = get();
    if (waiting === null) return;
    set({ applying: true });
    // Сообщение понимает service worker, собранный с `registerType: 'prompt'`:
    // он вызывает `skipWaiting` и берёт страницу под управление.
    waiting.postMessage({ type: 'SKIP_WAITING' });
  },
}));
