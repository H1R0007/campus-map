import { useCallback, useSyncExternalStore } from 'react';

/**
 * Ширина, с которой панель навигатора стоит слева от карты, а не шторкой снизу.
 *
 * Совпадает с префиксом `lg:` Tailwind: разметка и измерение панели
 * переключаются на одной границе. Уже этой ширины — телефоны и планшеты в
 * портретной ориентации, где панель слева оставила бы карте полосу в треть
 * экрана.
 */
export const WIDE_LAYOUT_QUERY = '(min-width: 1024px)';

/**
 * Совпадает ли медиазапрос — с подпиской на изменения: поворот телефона,
 * масштаб страницы, изменение окна.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [query]
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false
  );
}
