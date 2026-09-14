import { describe, expect, it } from 'vitest';
import { AliasManager } from '../src/index.js';
import { sampleDataset } from './helpers/sampleDataset.js';

/** Индекс названий синтетического кампуса (схема — в `helpers/sampleDataset.ts`). */
async function loadedManager(): Promise<AliasManager> {
  const dataset = await sampleDataset();
  const manager = new AliasManager();
  manager.load(dataset.aliases);
  return manager;
}

/**
 * Нечёткий поиск по названиям.
 *
 * Это единственный способ ввести пункт назначения в навигаторе, поэтому
 * проверяются и точное совпадение, и нормализация, и опечатки, и поведение
 * на границах (пустая строка, нулевой лимит).
 */
describe('AliasManager', () => {
  it('индексирует все формы имён из датасета', async () => {
    const manager = await loadedManager();

    expect(manager.size).toBe(20);
  });

  it('разрешает точное совпадение', async () => {
    const manager = await loadedManager();

    expect(manager.resolve('Главный вход')).toBe('campus_gate');
  });

  it('нормализует регистр, лишние пробелы и пунктуацию', async () => {
    const manager = await loadedManager();

    expect(manager.resolve('  главный   вход ')).toBe('campus_gate');
    expect(manager.resolve('ГЛАВНЫЙ ВХОД')).toBe('campus_gate');
  });

  it('для неизвестного названия возвращает null', async () => {
    const manager = await loadedManager();

    expect(manager.resolve('нет такого места')).toBeNull();
  });

  it('отдаёт основное и все дополнительные имена узла', async () => {
    const manager = await loadedManager();

    expect(manager.getPrimaryAliasForId('campus_gate')).toBe('Главный вход');
    expect(manager.getAliasesForId('campus_gate')).toHaveLength(4);
    expect(manager.getAliasesForId('nope')).toEqual([]);
  });

  it('предлагает варианты по номеру аудитории', async () => {
    const manager = await loadedManager();

    expect(manager.suggest('101', 3)[0]?.id).toBe('a1_room101');
  });

  it('предлагает варианты по префиксу', async () => {
    const manager = await loadedManager();

    expect(manager.suggest('конф', 3)[0]?.id).toBe('a3_conference');
  });

  it('находит аудиторию при неверной раскладке клавиатуры', async () => {
    const manager = await loadedManager();

    // «,b,kbjntrf» — это «библиотека», набранная в английской раскладке.
    expect(manager.suggest(',b,kbjntrf', 5).some((s) => s.id === 'b1_library')).toBe(true);
  });

  it('на пустом запросе и нулевом лимите не предлагает ничего', async () => {
    const manager = await loadedManager();

    expect(manager.suggest('', 5)).toEqual([]);
    expect(manager.suggest('ауд', 0)).toEqual([]);
  });

  it('кэш предложений не отравляется меньшим лимитом', async () => {
    const manager = await loadedManager();

    // Раньше запрос с limit=2 кэшировался и на limit=10, из-за чего
    // расширенный список подсказок оказывался обрезанным до двух пунктов.
    const short = manager.suggest('аудитория', 2);
    const long = manager.suggest('аудитория', 10);

    expect(short).toHaveLength(2);
    expect(long.length).toBeGreaterThan(short.length);
  });

  it('упорядочивает подсказки по убыванию релевантности', async () => {
    const manager = await loadedManager();
    const suggestions = manager.suggest('аудитория', 10);

    for (let i = 1; i < suggestions.length; i += 1) {
      expect(suggestions[i - 1].score).toBeGreaterThanOrEqual(suggestions[i].score);
    }
  });

  it('находит помещение по имени на другом языке', () => {
    const manager = new AliasManager();
    manager.load([
      {
        id: 'b1_library',
        names: ['Библиотека'],
        translations: { en: { names: ['Library', 'Reading room'] } },
      },
    ]);

    expect(manager.resolve('library')).toBe('b1_library');
    expect(manager.suggest('read', 3)[0]?.id).toBe('b1_library');
    // Основное имя по-прежнему на языке данных: перевод его не подменяет.
    expect(manager.getPrimaryAliasForId('b1_library')).toBe('Библиотека');
    expect(manager.getAliasesForId('b1_library')).toEqual(['Библиотека']);
  });

  it('находит номер аудитории, набранный латиницей', () => {
    // Табличка кириллическая, а английская раскладка у иностранного студента
    // включена всегда.
    const manager = new AliasManager();
    manager.load([
      { id: 'a3_room305', names: ['А-305'] },
      { id: 's2_room201', names: ['С-201'] },
    ]);

    expect(manager.resolve('A-305')).toBe('a3_room305');
    expect(manager.resolve('c-201')).toBe('s2_room201');
    expect(manager.suggest('a-30', 3)[0]?.id).toBe('a3_room305');
  });

  it('латинская B не становится кириллической В: это транслитерация Б', () => {
    // По виду B совпадает с «В», и свёртка по виду уверенно вела бы в чужой
    // корпус. Английское имя «B-201» у корпуса Б задаётся переводом.
    const manager = new AliasManager();
    manager.load([
      { id: 'v2_room201', names: ['В-201'] },
      { id: 'b2_room201', names: ['Б-201'], translations: { en: { names: ['B-201'] } } },
    ]);

    expect(manager.resolve('B-201')).toBe('b2_room201');
  });

  it('не различает «ё» и «е»', () => {
    const manager = new AliasManager();
    manager.load([{ id: 'c1_athletics', names: ['Зал лёгкой атлетики'] }]);

    expect(manager.resolve('зал легкой атлетики')).toBe('c1_athletics');
  });

  it('пустой менеджер не падает на любом запросе', () => {
    const manager = new AliasManager();

    expect(manager.size).toBe(0);
    expect(manager.resolve('что угодно')).toBeNull();
    expect(manager.suggest('что угодно', 5)).toEqual([]);
    expect(manager.getPrimaryAliasForId('x')).toBeNull();
  });
});
