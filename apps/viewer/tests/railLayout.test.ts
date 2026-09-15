import { describe, expect, it } from 'vitest';
import { railContentFor } from '../src/utils/railLayout';

/**
 * Правая колонка карты: кнопки масштаба уступают место этажам — сначала
 * «Показать целиком», потом «+» и «−», — в колонке ниже одной кнопки нет и
 * этажей, а компас повёрнутой карты — первым сверху.
 */
describe('railContentFor', () => {
  it('до замера и в высокой колонке — этажи и все кнопки', () => {
    expect(railContentFor(null, 3)).toEqual({ compass: false, floors: true, zoom: 'full' });
    expect(railContentFor(40, 11)).toEqual({ compass: false, floors: true, zoom: 'full' });
  });

  it('этажам остаются две кнопки, масштаб уступает сначала «Показать целиком»', () => {
    // Два этажа с промежутком — 6,25 rem, все кнопки масштаба — 9,5, пара — 6.
    expect(railContentFor(15.75, 5).zoom).toBe('full');
    expect(railContentFor(15.7, 5).zoom).toBe('pair');
    expect(railContentFor(12.25, 5).zoom).toBe('pair');
    expect(railContentFor(12.2, 5)).toEqual({ compass: false, floors: true, zoom: 'none' });
  });

  it('колонка ниже одной кнопки — без этажей и без масштаба', () => {
    expect(railContentFor(2.75, 5)).toEqual({ compass: false, floors: true, zoom: 'none' });
    expect(railContentFor(2.7, 5)).toEqual({ compass: false, floors: false, zoom: 'none' });
  });

  it('на территории этажей нет — место целиком у масштаба', () => {
    expect(railContentFor(null, 0)).toEqual({ compass: false, floors: false, zoom: 'full' });
    expect(railContentFor(9.5, 0)).toEqual({ compass: false, floors: false, zoom: 'full' });
    expect(railContentFor(6, 0).zoom).toBe('pair');
    expect(railContentFor(5.9, 0).zoom).toBe('none');
    expect(railContentFor(3.5 + 9.5, 1).zoom).toBe('full');
  });

  it('компас повёрнутой карты занимает кнопку с промежутком сверху', () => {
    // Компас с промежутком — 3,5 rem: всем кнопкам масштаба на территории нужно 9,5 + 3,5.
    expect(railContentFor(13, 0, true)).toEqual({ compass: true, floors: false, zoom: 'full' });
    expect(railContentFor(12.9, 0, true)).toEqual({ compass: true, floors: false, zoom: 'pair' });
    expect(railContentFor(2.7, 0, true)).toEqual({ compass: false, floors: false, zoom: 'none' });
  });
});
