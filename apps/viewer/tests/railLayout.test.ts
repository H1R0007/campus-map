import { describe, expect, it } from 'vitest';
import { zoomControlsFor } from '../src/utils/railLayout';

/**
 * Кнопки масштаба уступают место в низкой колонке карты: сначала «Показать
 * целиком», потом «+» и «−».
 */
describe('zoomControlsFor', () => {
  it('до замера и в высокой колонке — все кнопки', () => {
    expect(zoomControlsFor(null, 3)).toBe('full');
    expect(zoomControlsFor(40, 11)).toBe('full');
  });

  it('этажам остаются две кнопки, масштаб уступает сначала «Показать целиком»', () => {
    // Два этажа с промежутком — 6,25 rem, все кнопки масштаба — 9,5, пара — 6.
    expect(zoomControlsFor(15.75, 5)).toBe('full');
    expect(zoomControlsFor(15.7, 5)).toBe('pair');
    expect(zoomControlsFor(12.25, 5)).toBe('pair');
    expect(zoomControlsFor(12.2, 5)).toBe('none');
  });

  it('у одноэтажного корпуса и на территории этажам нужно меньше места', () => {
    expect(zoomControlsFor(9.5, 0)).toBe('full');
    expect(zoomControlsFor(6, 0)).toBe('pair');
    expect(zoomControlsFor(5.9, 0)).toBe('none');
    expect(zoomControlsFor(3.5 + 9.5, 1)).toBe('full');
  });
});
