import { describe, expect, it } from 'vitest';
import { AliasManager, buildingName } from '../src/index.js';
import type { BuildingMeta } from '../src/index.js';

/**
 * Имена из данных на языке интерфейса.
 *
 * Правило одно для корпусов и помещений: перевод, если он есть, иначе исходное
 * имя. Помещение без перевода не должно пропадать из англоязычного интерфейса.
 */

const BUILDING: BuildingMeta = {
  id: 'building_b',
  name: 'Корпус Б',
  translations: { en: { name: 'Building B' } },
  floors: [{ floor: 1 }],
};

describe('buildingName', () => {
  it('берёт перевод на язык интерфейса', () => {
    expect(buildingName(BUILDING, 'en')).toBe('Building B');
  });

  it('без перевода на этот язык — исходное имя', () => {
    expect(buildingName(BUILDING, 'ru')).toBe('Корпус Б');
    expect(buildingName(BUILDING, 'kk')).toBe('Корпус Б');
    expect(buildingName({ ...BUILDING, translations: undefined }, 'en')).toBe('Корпус Б');
  });
});

describe('AliasManager.getPrimaryAliasForId с языком', () => {
  function manager(): AliasManager {
    const aliases = new AliasManager();
    aliases.load([
      { id: 'b1_library', names: ['Библиотека', 'Читальный зал'], translations: { en: { names: ['Library'] } } },
      { id: 'a3_room305', names: ['А-305'] },
    ]);
    return aliases;
  }

  it('берёт первое имя перевода', () => {
    expect(manager().getPrimaryAliasForId('b1_library', 'en')).toBe('Library');
  });

  it('без перевода и без языка — исходное основное имя', () => {
    const aliases = manager();

    expect(aliases.getPrimaryAliasForId('a3_room305', 'en')).toBe('А-305');
    expect(aliases.getPrimaryAliasForId('b1_library', 'ru')).toBe('Библиотека');
    expect(aliases.getPrimaryAliasForId('b1_library')).toBe('Библиотека');
  });

  it('повторная загрузка не оставляет переводов прежнего набора', () => {
    const aliases = manager();
    aliases.load([{ id: 'b1_library', names: ['Библиотека'] }]);

    expect(aliases.getPrimaryAliasForId('b1_library', 'en')).toBe('Библиотека');
  });
});
