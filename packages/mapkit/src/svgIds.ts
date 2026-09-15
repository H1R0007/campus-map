/**
 * Свои `id` у каждого встроенного SVG-плана (запись 31).
 *
 * Встроенные планы живут в одном документе. Одинаковые `id` в разных файлах —
 * градиенты, штриховки, маркеры, символы — перекрывали бы друг друга: этаж
 * рисовался бы штриховкой соседнего плана, а скрытый план забирал бы её себе.
 * Каждый план получает свой префикс, и ссылки внутри файла переписываются
 * вместе с `id`. Функции работают со строками — их можно проверить без DOM.
 */

/** Переписывает ссылки `url(#id)` в значении атрибута: `fill`, `clip-path`, `style`… */
export function rewriteUrlReferences(value: string, ids: ReadonlyMap<string, string>): string {
  if (!value.includes('url(')) return value;
  return value.replace(/url\(\s*(['"]?)#([^'")\s]+)\1\s*\)/g, (match, quote: string, id: string) => {
    const scoped = ids.get(id);
    return scoped === undefined ? match : `url(${quote}#${scoped}${quote})`;
  });
}

/** Переписывает ссылку `href="#id"` (`<use>`, `<textPath>`); внешние ссылки не трогает. */
export function rewriteHrefReference(value: string, ids: ReadonlyMap<string, string>): string {
  if (!value.startsWith('#')) return value;
  const scoped = ids.get(value.slice(1));
  return scoped === undefined ? value : `#${scoped}`;
}

/**
 * Переписывает `#id` в тексте `<style>`: селекторы и `url(#id)`. Меняются только
 * известные `id` файла — цвет `#fff` останется цветом, если такого `id` нет.
 */
export function rewriteStyleReferences(css: string, ids: ReadonlyMap<string, string>): string {
  return css.replace(/#([A-Za-z_][\w-]*)/g, (match, id: string) => {
    const scoped = ids.get(id);
    return scoped === undefined ? match : `#${scoped}`;
  });
}
