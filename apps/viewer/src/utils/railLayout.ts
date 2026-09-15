/**
 * Что помещается в правую колонку карты (`MapRail`).
 *
 * Кнопки не сжимаются: в низкой колонке — маленький телефон или текст,
 * увеличенный в настройках, — нижние уходили под шторку. Этажи нужнее
 * масштаба, масштабировать можно жестом, поэтому кнопки уступают место:
 * сначала «Показать целиком», потом «+» и «−». Колонку ниже одной кнопки
 * оставляют и этажи: полоска списка в пару пикселей выглядела сломанной.
 */

/** Размеры колонки, rem: кнопка, промежуток между кнопками масштаба и между блоками колонки. */
const BUTTON_REM = 2.75;
const ZOOM_GAP_REM = 0.5;
const RESET_MARGIN_REM = 0.25;
const RAIL_GAP_REM = 0.75;

const ZOOM_FULL_REM = 3 * BUTTON_REM + 2 * ZOOM_GAP_REM + RESET_MARGIN_REM;
const ZOOM_PAIR_REM = 2 * BUTTON_REM + ZOOM_GAP_REM;

/** Сколько этажей остаются видны, прежде чем кнопки масштаба уступят им место. */
const MIN_VISIBLE_FLOORS = 2;

export interface RailContent {
  /** Показывать ли этажи корпуса. */
  floors: boolean;
  /** Кнопки масштаба: все, без «Показать целиком» или никаких. */
  zoom: 'full' | 'pair' | 'none';
}

/** Содержимое колонки высотой `heightRem` у корпуса с `floorCount` этажами. До замера — всё. */
export function railContentFor(heightRem: number | null, floorCount: number): RailContent {
  if (heightRem === null) return { floors: floorCount > 0, zoom: 'full' };

  const floors = floorCount > 0 && heightRem >= BUTTON_REM;
  const floorsRem = floors ? Math.min(floorCount, MIN_VISIBLE_FLOORS) * BUTTON_REM + RAIL_GAP_REM : 0;
  const zoom = heightRem >= floorsRem + ZOOM_FULL_REM ? 'full' : heightRem >= floorsRem + ZOOM_PAIR_REM ? 'pair' : 'none';
  return { floors, zoom };
}
