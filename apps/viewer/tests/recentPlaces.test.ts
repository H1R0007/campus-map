import { describe, expect, it } from 'vitest';
import { parseRecent, withRecent } from '../src/utils/recentPlaces';

/**
 * Недавние места поиска.
 */
describe('withRecent', () => {
  it('новое место — первым', () => {
    expect(withRecent(['a', 'b'], 'c')).toEqual(['c', 'a', 'b']);
  });

  it('повтор поднимается наверх, а не дублируется', () => {
    expect(withRecent(['a', 'b', 'c'], 'c')).toEqual(['c', 'a', 'b']);
  });

  it('лишнее отбрасывается с конца', () => {
    expect(withRecent(['a', 'b', 'c'], 'd', 3)).toEqual(['d', 'a', 'b']);
  });
});

describe('parseRecent', () => {
  it('читает сохранённый список', () => {
    expect(parseRecent('["a1_canteen","b1_library"]')).toEqual(['a1_canteen', 'b1_library']);
  });

  it('пустое хранилище, не JSON и не список — пустой список, а не исключение', () => {
    expect(parseRecent(null)).toEqual([]);
    expect(parseRecent('{битый')).toEqual([]);
    expect(parseRecent('{"recent":["a"]}')).toEqual([]);
  });

  it('пропускает всё, что не непустая строка, и обрезает до лимита', () => {
    expect(parseRecent('["a", 1, null, "", "b", "c"]', 2)).toEqual(['a', 'b']);
  });
});
