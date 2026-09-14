import { useCallback, useSyncExternalStore } from 'react';

/**
 * Ширина, с которой панель навигатора стоит слева от карты, а не шторкой снизу.
 *
 * Совпадает с префиксом `lg:` Tailwind: разметка и измерение панели
 * переключаются на одной границе. Уже этой ширины — телефоны и планшеты в
 * портретной ориентации, где панель слева оставила бы карте полосу в треть
 * экрана.
 */
//
// И на невысоком экране от 640 px — у телефона лёжа: шторка снизу закрывала
// бы большую часть карты (запись 28). Тот же запрос — вариант `wide:` в
// `tailwind.config.js` и медиазапросы `index.css`.
export const WIDE_LAYOUT_QUERY = '(min-width: 1024px), (min-width: 640px) and (max-height: 520px)';

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
