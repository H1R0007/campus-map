import { useEffect } from 'react';

/**
 * Пока `active`, экран не гаснет — Screen Wake Lock API (запись 23).
 *
 * Система снимает блокировку, когда вкладка уходит в фон, поэтому при
 * возвращении она запрашивается снова. Если браузер API не знает или отказал —
 * энергосбережение, неактивная вкладка, запрет, — навигация работает как
 * раньше, просто экран может погаснуть: сообщать об этом человеку незачем.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;

    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const request = async () => {
      try {
        const lock = await navigator.wakeLock.request('screen');
        if (cancelled) {
          void lock.release();
          return;
        }
        sentinel = lock;
      } catch {
        // См. описание хука: без блокировки навигация всё равно работает.
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && (sentinel === null || sentinel.released)) void request();
    };

    void request();
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (sentinel !== null && !sentinel.released) void sentinel.release();
    };
  }, [active]);
}
