import type { TransitionType } from '@campus-map/core';

/**
 * Обозначения типов переходов в интерфейсе и на карте: цвет и значок.
 *
 * Живут здесь, а не в ядре: ядро описывает кампус и маршрут и не знает, как
 * их рисуют. Раньше ядро отдавало эмодзи (`🛗`, `🪜`). Их вид зависит от
 * системы, а на части Android и Windows эмодзи лифта и лестницы нет вовсе —
 * на плане оставался пустой квадрат.
 *
 * Модуль без Leaflet и React: его проверяют тесты в Node, а маркеры Leaflet
 * берут отсюда разметку строкой. React-компонент — `TransitionGlyph`.
 */

/**
 * Цвет подложки значка.
 *
 * Значок на подложке белый. Контраст между ними не ниже 3:1 — порог WCAG
 * 1.4.11 для значимой графики, его проверяет тест. Прежние светлые оттенки
 * (янтарный, зелёный) давали около 2:1 и на солнце не читались.
 */
export const TRANSITION_COLORS: Readonly<Record<TransitionType, string>> = {
  entrance: '#B45309',
  stairs: '#15803D',
  lift: '#6D28D9',
  bridge: '#0E7490',
};

/** Контур значка: `d` одного пути в поле 24×24, рисуется обводкой. */
export const TRANSITION_GLYPH_PATHS: Readonly<Record<TransitionType, string>> = {
  // Дверной проём и стрелка внутрь.
  entrance: 'M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M4 12h10M10 8l4 4-4 4',
  // Ступени.
  stairs: 'M3 20h5v-5h5v-5h5V5h3',
  // Кабина со стрелками вверх и вниз.
  lift: 'M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM9 10l3-3 3 3M9 14l3 3 3-3',
  // Два корпуса и галерея между ними.
  bridge: 'M3 20V6h5v14M16 20V6h5v14M8 10h8M8 14h8',
};

/** Поле координат контуров. */
export const GLYPH_VIEWBOX = '0 0 24 24';

/** Толщина обводки в единицах поля: значок в 14 px остаётся читаемым. */
export const GLYPH_STROKE_WIDTH = 2.25;

/**
 * Разметка значка строкой — для `divIcon` Leaflet, которому нужен HTML.
 *
 * Цвет обводки — `currentColor`, его задаёт окружающий элемент. Значок
 * декоративный (`aria-hidden`): тип перехода называет текст рядом с ним.
 */
export function transitionGlyphMarkup(type: TransitionType, size: number): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${GLYPH_VIEWBOX}" ` +
    `fill="none" stroke="currentColor" stroke-width="${GLYPH_STROKE_WIDTH}" stroke-linecap="round" ` +
    `stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${TRANSITION_GLYPH_PATHS[type]}"/></svg>`
  );
}
