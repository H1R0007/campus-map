/**
 * Какие кнопки масштаба помещаются в правую колонку карты (`MapRail`).
 *
 * Кнопки не сжимаются: в низкой колонке — маленький телефон или текст,
 * увеличенный в настройках, — нижние уходили под шторку. Этажи нужнее
 * масштаба, масштабировать можно жестом, поэтому кнопки уступают место:
 * сначала «Показать целиком», потом «+» и «−».
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

export type ZoomControlsFit = 'full' | 'pair' | 'none';

/**
 * Кнопки масштаба для колонки высотой `heightRem` над этажами корпуса: все,
 * без «Показать целиком» или никаких. До замера — все.
 */
export function zoomControlsFor(heightRem: number | null, floorCount: number): ZoomControlsFit {
  if (heightRem === null) return 'full';
  const floors = floorCount > 0 ? Math.min(floorCount, MIN_VISIBLE_FLOORS) * BUTTON_REM + RAIL_GAP_REM : 0;
  if (heightRem >= floors + ZOOM_FULL_REM) return 'full';
  if (heightRem >= floors + ZOOM_PAIR_REM) return 'pair';
  return 'none';
}
