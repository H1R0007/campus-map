import { describe, expect, it } from 'vitest';
import { mapInsetsOf } from '../src/components/Map/mapChrome';

/**
 * Отступы подгонки карты: постоянный интерфейс плюс измеренная панель.
 */
describe('mapInsetsOf', () => {
  it('без панели — отступы шапки, колонки этажей и полей', () => {
    expect(mapInsetsOf({ bottom: 0, left: 0 })).toEqual({ top: 72, right: 64, bottom: 16, left: 16 });
  });

  it('шторка снизу поднимает нижний край вписанного плана над собой', () => {
    expect(mapInsetsOf({ bottom: 200, left: 0 })).toEqual({ top: 72, right: 64, bottom: 212, left: 16 });
  });

  it('панель слева сдвигает левый край, нижний остаётся полем', () => {
    expect(mapInsetsOf({ bottom: 0, left: 400 })).toEqual({ top: 72, right: 64, bottom: 16, left: 412 });
  });
});
