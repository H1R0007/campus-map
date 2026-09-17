import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from '../src/stores/editorStore';
import { useHistoryStore } from '../src/stores/historyStore';
import { loadFixture, openFloor, store } from './helpers/fixture';

/**
 * Правки, которые молча портили данные: вставка не на тот план и сдвиг
 * стрелками, который притягивался обратно к сетке.
 */

beforeEach(() => loadFixture());

const select = (...ids: string[]) => useEditorStore.setState({ selectedNodeIds: new Set(ids) });
const node = (id: string) => store().nodes.get(id);
const pasted = () => [...store().selectedNodeIds].map((id) => node(id)!);

describe('вставка на открытый план', () => {
  beforeEach(() => {
    openFloor(1);
    select('a1_hall', 'a1_room101');
    store().copySelected();
  });

  it('на тот же план — рядом с оригиналом', () => {
    store().paste();
    const copies = pasted();
    expect(copies).toHaveLength(2);
    for (const copy of copies) {
      expect(copy.building).toBe('building_a');
      expect(copy.floor).toBe(1);
    }
    expect(copies.some((c) => c.x === 120 && c.y === 140)).toBe(true);
  });

  it('на другой этаж — в те же координаты, чтобы повторить коридор', () => {
    openFloor(2);
    store().paste();
    const copies = pasted();
    expect(copies.map((c) => `${c.building}#${c.floor}`)).toEqual(['building_a#2', 'building_a#2']);
    expect(copies.map((c) => `${c.x},${c.y}`).sort()).toEqual(['100,120', '100,60']);
  });

  it('на территорию кампуса — узлы на территории, а не в корпусе', () => {
    openFloor(null);
    store().paste();
    const copies = pasted();
    expect(copies.map((c) => `${c.building}#${c.floor}`)).toEqual(['CAMPUS#0', 'CAMPUS#0']);
    // Вставленное видно там, куда вставляли.
    const visible = store().getNodesForCurrentFloor().map((n) => n.id);
    for (const copy of copies) expect(visible).toContain(copy.id);
  });

  it('связи внутри скопированного переносятся, чужие — нет', () => {
    store().paste();
    const copies = pasted();
    const hall = copies.find((c) => c.x === 120 && c.y === 140)!;
    const room = copies.find((c) => c.x === 120 && c.y === 80)!;
    expect(hall.neighbors).toEqual([room.id]);
    expect(room.neighbors).toEqual([hall.id]);
  });
});

describe('сдвиг стрелками', () => {
  it('двигает ровно на шаг и не притягивает к сетке', () => {
    store().setGridSettings({ enabled: true, snap: true, size: 20 });
    select('a1_room101');
    store().moveSelectedBy(1, 0);
    expect([node('a1_room101')!.x, node('a1_room101')!.y]).toEqual([101, 60]);
  });

  it('подряд идущие сдвиги — одна запись отмены', () => {
    select('a1_room101');
    store().moveSelectedBy(5, 0);
    store().moveSelectedBy(5, 0);
    store().moveSelectedBy(0, 5);

    expect(useHistoryStore.getState().entries).toHaveLength(1);
    expect([node('a1_room101')!.x, node('a1_room101')!.y]).toEqual([110, 65]);

    store().undo();
    expect([node('a1_room101')!.x, node('a1_room101')!.y]).toEqual([100, 60]);

    store().redo();
    expect([node('a1_room101')!.x, node('a1_room101')!.y]).toEqual([110, 65]);
  });

  it('сдвиг другого набора узлов — отдельная запись', () => {
    select('a1_room101');
    store().moveSelectedBy(5, 0);
    select('a1_hall');
    store().moveSelectedBy(5, 0);
    expect(useHistoryStore.getState().entries).toHaveLength(2);
  });
});
