import { describe, expect, it } from 'vitest';
import { AliasManager } from '../src/index.js';
import type { AliasEntry } from '../src/index.js';

/**
 * Поиск, прощающий ошибки: номер в любом написании, опечатки по длине слова,
 * разговорные слова категорий (запись 20).
 */

const ENTRIES: AliasEntry[] = [
  { id: 'a3_room305', names: ['А-305', '305'] },
  { id: 'b3_room305', names: ['Б-305'], translations: { en: { names: ['B-305'] } } },
  { id: 'a1_canteen', names: ['Столовая', 'Столовая корпуса А'], category: 'food' },
  { id: 'b1_canteen', names: ['Буфет'], category: 'food' },
  { id: 'a2_toilet', names: ['WC, 2 этаж'], category: 'toilet' },
  { id: 'b1_library', names: ['Библиотека', 'Читальный зал'] },
  { id: 'a3_conference', names: ['Конференц-зал'] },
];

const TERMS = { food: ['столовая', 'столовка', 'поесть'], toilet: ['туалет', 'toilet'] };

function manager(): AliasManager {
  const aliases = new AliasManager();
  aliases.load(ENTRIES, { categoryTerms: TERMS });
  return aliases;
}

const top = (aliases: AliasManager, query: string) => aliases.suggest(query, 5)[0]?.id;
const ids = (aliases: AliasManager, query: string) => new Set(aliases.suggest(query, 20).map((s) => s.id));

describe('поиск: номер аудитории в любом написании', () => {
  it.each(['305', 'А-305', 'А305', 'а 305', 'a305', 'A-305', 'f305'])('«%s» → А-305', (query) => {
    expect(top(manager(), query)).toBe('a3_room305');
  });

  it('точный ввод слитного номера разрешается', () => {
    // Раньше «а305» находилось только подпоследовательностью «а 305»: подсказка
    // была, а точное совпадение — для ссылки или Enter — нет.
    expect(manager().resolve('А305')).toBe('a3_room305');
    expect(manager().resolve('a305')).toBe('a3_room305');
  });

  it('буква корпуса слитно не уводит в другой корпус', () => {
    expect(top(manager(), 'Б305')).toBe('b3_room305');
    expect(top(manager(), 'b305')).toBe('b3_room305');
  });
});

describe('поиск: опечатки', () => {
  it('в длинном слове прощает опечатки', () => {
    expect(top(manager(), 'библиотеко')).toBe('b1_library');
    // Перестановка букв — две правки.
    expect(top(manager(), 'бибилотека')).toBe('b1_library');
  });

  it('прощает опечатку в недонабранном слове', () => {
    // «бибило» — не подпоследовательность «библиотека»: находит только сравнение
    // с началом слова.
    expect(top(manager(), 'бибило')).toBe('b1_library');
  });

  it('прощает опечатку в названии из нескольких слов', () => {
    expect(top(manager(), 'конференц зл')).toBe('a3_conference');
  });

  it('короткому запросу опечаток не прощает', () => {
    // «зад» на одну правку от «зал», но для трёх букв такое совпадение — шум.
    expect(ids(manager(), 'зад').has('a3_conference')).toBe(false);
  });

  it('разговорное сокращение находит место подпоследовательностью', () => {
    expect(top(manager(), 'библа')).toBe('b1_library');
  });
});

describe('поиск: слова категорий', () => {
  it('разговорное слово находит все места категории', () => {
    expect(ids(manager(), 'поесть')).toEqual(new Set(['a1_canteen', 'b1_canteen']));
    expect(ids(manager(), 'столовка')).toEqual(expect.objectContaining({ size: 2 }));
    expect([...ids(manager(), 'столовка')].sort()).toEqual(['a1_canteen', 'b1_canteen']);
  });

  it('находит по слову на другом языке', () => {
    expect(top(manager(), 'toilet')).toBe('a2_toilet');
  });

  it('подсказка по слову категории помечена категорией', () => {
    const [suggestion] = manager().suggest('туалет', 5);

    expect(suggestion).toMatchObject({ id: 'a2_toilet', viaCategory: 'toilet' });
  });

  it('при равном совпадении имя места выше слова категории', () => {
    // «столовая» — и имя места, и слово категории обеих столовых.
    const suggestions = manager().suggest('столовая', 5);

    expect(suggestions[0]).toMatchObject({ id: 'a1_canteen', alias: 'Столовая' });
    expect(suggestions[0].viaCategory).toBeUndefined();
    expect(suggestions.some((s) => s.id === 'b1_canteen')).toBe(true);
  });

  it('слова категорий не разрешаются точным вводом и не считаются именами', () => {
    const aliases = manager();
    const plain = new AliasManager();
    plain.load(ENTRIES);

    expect(aliases.resolve('поесть')).toBeNull();
    expect(aliases.resolveAll('туалет')).toEqual([]);
    expect(aliases.getAliasesForId('b1_canteen')).toEqual(['Буфет']);
    expect([...aliases.ambiguousAliases().keys()]).toEqual([]);
    expect(aliases.size).toBe(plain.size);
  });

  it('без слов категорий по ним ничего не находится', () => {
    const aliases = new AliasManager();
    aliases.load(ENTRIES);

    expect(aliases.suggest('поесть', 5)).toEqual([]);
  });

  it('повторная загрузка без слов категорий их забывает', () => {
    const aliases = manager();
    aliases.load(ENTRIES);

    expect(aliases.suggest('туалет', 5)).toEqual([]);
  });
});
