import { describe, expect, it } from 'vitest';
import { AliasManager } from '../src/index.js';

/**
 * Поиск по аббревиатуре названия.
 *
 * Раньше однословный запрос превращался в аббревиатуру из одной первой буквы,
 * и она совпадала с первой буквой любого названия: на «canteen» (после свёртки
 * латинских двойников — «с…») подсказки предлагали «Спортзал», «Гардероб» и
 * «Компьютерный класс».
 */

function manager(): AliasManager {
  const aliases = new AliasManager();
  aliases.load([
    { id: 'canteen', names: ['Столовая'], translations: { en: { names: ['Canteen'] } } },
    { id: 'gym', names: ['Спортзал', 'Спортивный зал'] },
    { id: 'cloakroom', names: ['Гардероб'], translations: { en: { names: ['Cloakroom'] } } },
    { id: 'lab', names: ['Компьютерный класс'], translations: { en: { names: ['Computer lab'] } } },
    { id: 'conference', names: ['Конференц-зал'] },
    { id: 'cashier', names: ['Касса'] },
  ]);
  return aliases;
}

const ids = (aliases: AliasManager, query: string) => [...new Set(aliases.suggest(query, 20).map((s) => s.id))];

describe('AliasManager: аббревиатуры', () => {
  it('однословный запрос не совпадает с названиями на ту же первую букву', () => {
    expect(ids(manager(), 'canteen')).toEqual(['canteen']);
  });

  it('однословный запрос из букв аббревиатуры находит название', () => {
    // «кз» — ни префикс, ни подстрока «Конференц-зал», только аббревиатура.
    expect(ids(manager(), 'кз')[0]).toBe('conference');
  });

  it('многословный запрос читается по первым буквам слов', () => {
    expect(ids(manager(), 'спорт з')).toContain('gym');
  });

  it('одна буква аббревиатурой не считается', () => {
    // «к» по-прежнему находит названия на «к» — префиксом, а не аббревиатурой.
    const found = ids(manager(), 'к');
    expect(found).toEqual(expect.arrayContaining(['conference', 'cashier', 'lab']));
    expect(found).not.toContain('gym');
  });
});
