/** Цветовые токены редактора из `index.css`, которые нужны значением. */
export type EditorThemeToken = '--editor-highlight';

/**
 * Цвет токена темы редактора строкой — для слоёв Leaflet.
 *
 * Leaflet пишет цвет в атрибуты SVG (`fill`, `stroke`), а они не понимают
 * `var()`. Поэтому цвет читается из CSS-переменной, а не копируется в код
 * литералом: тема редактора объявлена в одном месте. У навигатора такая же
 * функция своя — его токены записаны каналами RGB, у редактора — цветом.
 *
 * @throws если токен не объявлен — иначе узел молча рисовался бы чёрным
 */
export function themeColor(token: EditorThemeToken): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  if (value === '') {
    throw new Error(`Цветовой токен ${token} не объявлен в index.css`);
  }
  return value;
}
