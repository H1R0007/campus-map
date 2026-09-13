import type { TransitionType } from '@campus-map/core';
import { GLYPH_STROKE_WIDTH, GLYPH_VIEWBOX, TRANSITION_GLYPH_PATHS } from './transitionGlyphs.js';

export interface TransitionGlyphProps {
  type: TransitionType;
  /** Сторона значка, CSS-пиксели. */
  size?: number;
  className?: string;
}

/**
 * Значок типа перехода для React-интерфейса.
 *
 * Контур тот же, что у маркеров на карте (`transitionGlyphMarkup`), поэтому
 * лифт в шагах маршрута и лифт на плане выглядят одинаково. Цвет —
 * `currentColor`. Значок декоративный: тип перехода называет текст рядом.
 */
export function TransitionGlyph({ type, size = 16, className }: TransitionGlyphProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={GLYPH_VIEWBOX}
      fill="none"
      stroke="currentColor"
      strokeWidth={GLYPH_STROKE_WIDTH}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d={TRANSITION_GLYPH_PATHS[type]} />
    </svg>
  );
}
