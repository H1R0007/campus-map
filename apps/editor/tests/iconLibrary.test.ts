import { describe, expect, it } from 'vitest';
import type { IconLibrary, LibraryIcon } from '../src/utils/iconLibrary';
import { CURATED_ICON_GROUPS, iconImageOf, iconLabel, searchIcons } from '../src/utils/iconLibrary';

/**
 * Поиск значков вида. Метки библиотеки английские, поэтому частые места
 * кампуса ищутся и по-русски — по подборке с русскими названиями и словами.
 */

const icon = (name: string, tags: string): LibraryIcon => ({
  name,
  category: 'Test',
  tags,
  nodes: [['path', { d: 'M4 4h16' }]],
});

const library: IconLibrary = new Map(
  [
    icon('first-aid-kit', 'medical healthcare hospital'),
    icon('stethoscope', 'doctor medic'),
    icon('coffee', 'cup drink cafe'),
    icon('printer', 'print office'),
    icon('rocket', 'space launch'),
    icon('school', 'education'),
  ].map((item) => [item.name, item] as const)
);

describe('поиск значков', () => {
  it('по-русски — по подборке: название и слова', () => {
    expect(searchIcons(library, 'врач')).toEqual(['first-aid-kit', 'stethoscope']);
    expect(searchIcons(library, 'Кофе')).toEqual(['coffee']);
    expect(searchIcons(library, 'распечатать')).toEqual(['printer']);
  });

  it('по-английски — по имени и меткам библиотеки', () => {
    expect(searchIcons(library, 'print')).toEqual(['printer']);
    expect(searchIcons(library, 'space')).toEqual(['rocket']);
    expect(searchIcons(library, 'doctor')).toEqual(['stethoscope']);
  });

  it('все слова запроса должны найтись; пустой запрос — пусто', () => {
    expect(searchIcons(library, 'медпункт аптечка')).toEqual(['first-aid-kit']);
    expect(searchIcons(library, 'медпункт кофе')).toEqual([]);
    expect(searchIcons(library, '   ')).toEqual([]);
  });

  it('ё и е не различаются', () => {
    expect(searchIcons(library, 'учёба')).toEqual(['school']);
    expect(searchIcons(library, 'учеба')).toEqual(['school']);
  });

  it('значок подборки называется по-русски, остальные — именем библиотеки', () => {
    expect(iconLabel('coffee')).toBe('Кофе');
    expect(iconLabel('rocket')).toBe('rocket');
    expect(iconLabel('some-thing')).toBe('some thing');
  });

  it('картинка значка — SVG-адрес для данных; неизвестного значка нет', () => {
    expect(iconImageOf(library, 'coffee')).toMatch(/^data:image\/svg\+xml,/);
    expect(iconImageOf(library, 'no-such-icon')).toBeNull();
  });

  it('в подборке нет повторов', () => {
    const names = CURATED_ICON_GROUPS.flatMap((group) => group.icons.map((item) => item.name));
    expect(new Set(names).size).toBe(names.length);
  });
});
