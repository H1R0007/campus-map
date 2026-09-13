import { describe, expect, it } from 'vitest';
import { AliasManager } from '../src/index.js';

/**
 * Совпадающие названия у разных узлов.
 *
 * На кампусе из пяти корпусов это норма, а не ошибка данных: «Столовая» есть
 * в каждом корпусе, «101» — почти на каждом этаже. Раньше индекс точного
 * поиска хранил одно значение на имя, и при совпадении молча побеждало
 * последнее объявленное — поиск уверенно вёл не туда.
 *
 * Фикстура синтетическая: проверяется поведение класса, а не содержимое
 * продуктового датасета.
 */

function managerWith(entries: { id: string; names: string[] }[]): AliasManager {
  const manager = new AliasManager();
  manager.load(entries);
  return manager;
}

const CANTEENS = [
  { id: 'a1_canteen', names: ['Столовая', 'Буфет А'] },
  { id: 'b1_canteen', names: ['Столовая'] },
  { id: 'c2_room201', names: ['В-201'] },
];

describe('AliasManager: совпадающие названия', () => {
  it('не выбирает узел за пользователя, если имя неоднозначно', () => {
    const manager = managerWith(CANTEENS);

    expect(manager.resolve('Столовая')).toBeNull();
  });

  it('отдаёт все узлы с таким именем в порядке объявления', () => {
    const manager = managerWith(CANTEENS);

    expect(manager.resolveAll('столовая')).toEqual(['a1_canteen', 'b1_canteen']);
  });

  it('однозначные имена по-прежнему разрешаются', () => {
    const manager = managerWith(CANTEENS);

    expect(manager.resolve('Буфет А')).toBe('a1_canteen');
    expect(manager.resolve('в-201')).toBe('c2_room201');
  });

  it('перечисляет неоднозначные имена для диагностики', () => {
    const manager = managerWith(CANTEENS);

    const ambiguous = manager.ambiguousAliases();

    expect([...ambiguous.keys()]).toEqual(['столовая']);
    expect(ambiguous.get('столовая')).toEqual(['a1_canteen', 'b1_canteen']);
  });

  it('повтор имени у одного и того же узла неоднозначностью не считается', () => {
    const manager = managerWith([{ id: 'a1_hall', names: ['Холл', 'холл', 'ХОЛЛ'] }]);

    expect(manager.resolve('Холл')).toBe('a1_hall');
    expect(manager.ambiguousAliases().size).toBe(0);
  });

  it('подсказки показывают каждый из одноимённых узлов', () => {
    const manager = managerWith(CANTEENS);

    // Именно этим студент выбирает нужную столовую. Схлопывание подсказок по
    // одному только тексту оставило бы в списке одну из двух — вторая
    // становилась недостижимой из интерфейса.
    const ids = manager.suggest('Столовая', 5).map((s) => s.id);

    expect(ids).toContain('a1_canteen');
    expect(ids).toContain('b1_canteen');
  });

  it('несуществующее имя даёт пустой список, а не null', () => {
    const manager = managerWith(CANTEENS);

    expect(manager.resolveAll('Спортзал')).toEqual([]);
    expect(manager.resolve('Спортзал')).toBeNull();
  });
});
