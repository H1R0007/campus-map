/** Цветовые токены навигатора, объявленные в `index.css`. */
export type ThemeToken = '--color-primary' | '--color-primary-hover' | '--color-start';

/**
 * Цвет токена темы строкой — для слоёв карты на canvas.
 *
 * Canvas не получает CSS-классов, и цвет ему нужен значением. Он читается из
 * CSS-переменной, а не копируется в код: так фирменный цвет объявлен в одном
 * месте.
 *
 * @throws если токен не объявлен — иначе canvas молча рисовал бы чёрным
 */
export function themeColor(token: ThemeToken): string {
  const channels = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  if (channels === '') {
    throw new Error(`Цветовой токен ${token} не объявлен в index.css`);
  }
  return `rgb(${channels})`;
}
