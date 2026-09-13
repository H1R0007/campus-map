import { describe, expect, it } from 'vitest';
import { TRANSITION_TYPES } from '@campus-map/core';
import { TRANSITION_COLORS, TRANSITION_GLYPH_PATHS, transitionGlyphMarkup } from '../src/transitionGlyphs.js';

/** Относительная яркость цвета `#RRGGBB` по WCAG 2. */
function luminance(hex: string): number {
  const channel = (offset: number) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** Контраст двух цветов по WCAG 2: от 1 до 21. */
function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

describe('обозначения переходов', () => {
  it('цвет каждого типа задан в виде #RRGGBB', () => {
    for (const type of TRANSITION_TYPES) {
      expect(TRANSITION_COLORS[type], type).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });

  it('белый значок на подложке любого типа — контраст не ниже 3:1 (WCAG 1.4.11)', () => {
    for (const type of TRANSITION_TYPES) {
      expect(contrast(TRANSITION_COLORS[type], '#FFFFFF'), type).toBeGreaterThanOrEqual(3);
    }
  });

  it('типы различаются и цветом, и контуром', () => {
    const colors = new Set(TRANSITION_TYPES.map((type) => TRANSITION_COLORS[type].toUpperCase()));
    const paths = new Set(TRANSITION_TYPES.map((type) => TRANSITION_GLYPH_PATHS[type]));

    expect(colors.size).toBe(TRANSITION_TYPES.length);
    expect(paths.size).toBe(TRANSITION_TYPES.length);
  });

  it('разметка — декоративный SVG заданного размера с контуром своего типа', () => {
    const markup = transitionGlyphMarkup('lift', 14);

    expect(markup).toMatch(/^<svg [^>]*width="14" height="14"/);
    expect(markup).toContain('stroke="currentColor"');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain(`<path d="${TRANSITION_GLYPH_PATHS.lift}"/>`);
    expect(markup.endsWith('</svg>')).toBe(true);
  });
});
