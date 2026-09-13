import { describe, expect, it } from 'vitest';
import { scrollEdges } from '../src/utils/scrollEdges';

/**
 * Признак прокрутки ленты корпусов: гаснет край, за которым есть ещё корпуса.
 */
describe('scrollEdges', () => {
  it('всё помещается — ни один край не гаснет', () => {
    expect(scrollEdges(0, 300, 300)).toEqual({ start: false, end: false });
  });

  it('в начале длинной ленты гаснет только правый край, в середине — оба', () => {
    expect(scrollEdges(0, 300, 900)).toEqual({ start: false, end: true });
    expect(scrollEdges(250, 300, 900)).toEqual({ start: true, end: true });
  });

  it('дробная прокрутка у конца ленты считается концом', () => {
    // При масштабе страницы 110 % прокрутка останавливается на дробном пикселе.
    expect(scrollEdges(599.5, 300, 900)).toEqual({ start: true, end: false });
  });
});
