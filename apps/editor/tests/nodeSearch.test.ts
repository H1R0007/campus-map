import { beforeEach, describe, expect, it } from 'vitest';
import { searchNodeHits } from '../src/utils/nodeSearch';
import { loadFixture, store } from './helpers/fixture';

beforeEach(() => loadFixture());

const ids = (query: string) => {
  const st = store();
  return searchNodeHits(query, st.nodes, st.aliases, st.aliasTranslations).map((hit) => hit.node.id);
};

describe('поиск узлов', () => {
  it('название с опечаткой находит место', () => {
    expect(ids('Главнй вход')[0]).toBe('campus_gate');
  });

  it('латинские буквы вместо русских — то же место', () => {
    // «a» и «A» латинские: так набирают, не переключив раскладку.
    expect(ids('a-101')[0]).toBe('a1_room101');
  });

  it('набор в другой раскладке находит место', () => {
    // «Главный» в английской раскладке.
    expect(ids('Ukfdysq')[0]).toBe('campus_gate');
  });

  it('английское название из переводов находит место', () => {
    expect(ids('A-101')[0]).toBe('a1_room101');
  });

  it('точный id — первым, затем id, содержащие запрос', () => {
    expect(ids('a1_hall')[0]).toBe('a1_hall');
    expect(ids('stairs').sort()).toEqual(['a1_stairs', 'a2_stairs']);
  });

  it('координаты находят узлы у точки, ближний — первым', () => {
    expect(ids('100, 125')).toEqual(['a1_hall']);
    expect(ids('(300 120)').sort()).toEqual(['a1_stairs', 'a2_stairs']);
  });

  it('новое название ищется сразу после правки', () => {
    expect(ids('Холл')).not.toContain('a1_hall');
    store().setNodeAliases('a1_hall', ['Холл']);
    expect(ids('Холл')[0]).toBe('a1_hall');
  });

  it('совпавшее название возвращается вместе с узлом', () => {
    const st = store();
    const [hit] = searchNodeHits('101', st.nodes, st.aliases, st.aliasTranslations);
    expect(hit.node.id).toBe('a1_room101');
    expect(hit.matched).toBe('101');
  });
});
