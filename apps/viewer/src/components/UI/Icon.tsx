/**
 * Значки интерфейса навигатора — контуры SVG.
 *
 * Эмодзи и текстовые символы (🔎, ✓, ✕, ⇅) рисует система: на части Windows и
 * Android нужных нет, а цветная лупа спорила с фирменным цветом (запись 16).
 * Контуры рисуются обводкой `currentColor` в поле 24×24 — как значки переходов
 * `TransitionGlyph` из mapkit, и стоят с ними в одном ряду.
 *
 * Значков типов переходов здесь нет: у лестницы, лифта, входа и перехода значок
 * один — `TransitionGlyph`. Большинство контуров — Heroicons v1 (MIT);
 * `route` и `layers` нарисованы здесь.
 */
const ICON_PATHS = {
  search: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
  close: 'M6 18L18 6M6 6l12 12',
  back: 'M15 19l-7-7 7-7',
  forward: 'M9 5l7 7-7 7',
  expand: 'M5 15l7-7 7 7',
  collapse: 'M19 9l-7 7-7-7',
  swap: 'M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4',
  share:
    'M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z',
  // Дорожный указатель поворота: ромб и стрелка направо.
  route: 'M12 2.5l9.5 9.5-9.5 9.5L2.5 12 12 2.5zM9 15v-2.5a2 2 0 012-2h4.5M13 8l2.5 2.5L13 13',
  start: 'M5 3l14 9-14 9V3z',
  check: 'M5 13l4 4L19 7',
  pin: 'M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0zM15 11a3 3 0 11-6 0 3 3 0 016 0z',
  building:
    'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
  // Два плана один над другим — «этаж».
  layers: 'M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5',
  recent: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
  walk: 'M5 12h14M13 6l6 6-6 6',
  alert:
    'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
  plus: 'M12 4v16m8-8H4',
  minus: 'M20 12H4',
  fit: 'M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4',
} satisfies Record<string, string>;

export type IconName = keyof typeof ICON_PATHS;

export interface IconProps {
  name: IconName;
  /** Сторона значка, CSS-пиксели. */
  size?: number;
  /** Залить контур цветом обводки — например, треугольник «начать». */
  filled?: boolean;
  className?: string;
}

/**
 * Значок. Декоративный (`aria-hidden`): действие называет текст рядом или
 * `aria-label` кнопки.
 */
export function Icon({ name, size = 20, filled = false, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}
