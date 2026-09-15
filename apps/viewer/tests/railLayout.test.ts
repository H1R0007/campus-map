import { describe, expect, it } from 'vitest';
import { railContentFor } from '../src/utils/railLayout';

/**
 * Правая колонка карты: кнопки масштаба уступают место этажам — сначала
 * «Показать целиком», потом «+» и «−», — а в колонке ниже одной кнопки нет и
 * этажей.
 */
describe('railContentFor', () => {
  it('до замера и в высокой колонке — этажи и все кнопки', () => {
    expect(railContentFor(null, 3)).toEqual({ floors: true, zoom: 'full' });
    expect(railContentFor(40, 11)).toEqual({ floors: true, zoom: 'full' });
  });

  it('этажам остаются две кнопки, масштаб уступает сначала «Показать целиком»', () => {
    // Два этажа с промежутком — 6,25 rem, все кнопки масштаба — 9,5, пара — 6.
    expect(railContentFor(15.75, 5).zoom).toBe('full');
    expect(railContentFor(15.7, 5).zoom).toBe('pair');
    expect(railContentFor(12.25, 5).zoom).toBe('pair');
    expect(railContentFor(12.2, 5)).toEqual({ floors: true, zoom: 'none' });
  });

  it('колонка ниже одной кнопки — без этажей и без масштаба', () => {
    expect(railContentFor(2.75, 5)).toEqual({ floors: true, zoom: 'none' });
    expect(railContentFor(2.7, 5)).toEqual({ floors: false, zoom: 'none' });
  });

  it('на территории этажей нет — место целиком у масштаба', () => {
    expect(railContentFor(null, 0)).toEqual({ floors: false, zoom: 'full' });
    expect(railContentFor(9.5, 0)).toEqual({ floors: false, zoom: 'full' });
    expect(railContentFor(6, 0).zoom).toBe('pair');
    expect(railContentFor(5.9, 0).zoom).toBe('none');
    expect(railContentFor(3.5 + 9.5, 1).zoom).toBe('full');
  });
});
