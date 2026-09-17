import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from '../src/stores/editorStore';
import { useHistoryStore } from '../src/stores/historyStore';
import { dataSnapshot, loadFixture, openFloor, store } from './helpers/fixture';

/**
 * Отмена и повтор каждого действия правки.
 *
 * Свойство одно на все действия: «сделать → отменить» возвращает данные
 * ровно к прежним, «→ повторить» — ровно к сделанным. Отмена, которая
 * возвращает «почти то же», теряет разметку незаметно для разметчика.
 */

beforeEach(() => loadFixture());

interface Case {
  name: string;
  /** Подготовка: открыть этаж, выделить узлы. Не должна менять данные. */
  setup?: () => void;
  act: () => void;
}

const select = (...ids: string[]) => useEditorStore.setState({ selectedNodeIds: new Set(ids) });

const cases: Case[] = [
  { name: 'добавить узел', setup: () => openFloor(1), act: () => store().addNode(250, 150) },
  { name: 'удалить узел с алиасами, заметкой и переходом', act: () => store().removeNode('a1_room101') },
  { name: 'удалить узел перехода', act: () => store().removeNode('a1_stairs') },
  {
    name: 'перетащить узел',
    act: () => {
      store().moveNode('a1_hall', 130, 140);
      store().commitMoveNode('a1_hall', 100, 120, 130, 140);
    },
  },
  { name: 'изменить признак перехода', act: () => store().updateNode('a1_hall', { isPortal: true }) },
  { name: 'добавить ребро', act: () => store().addEdge('a1_entrance', 'a1_room101') },
  { name: 'удалить ребро', act: () => store().removeEdge('a1_hall', 'a1_stairs') },
  { name: 'добавить переход', act: () => store().addTransition('a1_room101', 'a2_room201', 'lift') },
  { name: 'удалить переход', act: () => store().removeTransition('a2_stairs', 'a1_stairs') },
  { name: 'добавить алиас', act: () => store().setNodeAliases('a2_room201', ['А-201', 'Лаборатория']) },
  { name: 'убрать все алиасы', act: () => store().setNodeAliases('a1_room101', []) },
  { name: 'алиасы узлу без алиасов', act: () => store().setNodeAliases('a1_hall', ['Холл']) },
  { name: 'изменить заметку', act: () => store().setNodeComment('a1_room101', 'дверь закрыта после 18:00') },
  { name: 'стереть заметку', act: () => store().setNodeComment('a1_room101', '') },
  { name: 'разделить ребро', act: () => store().splitEdge('a1_hall', 'a1_stairs') },
  { name: 'сменить тип перехода', act: () => store().updateTransitionType('a2_stairs', 'a1_stairs', 'lift') },
  {
    name: 'перетащить несколько узлов',
    act: () => {
      const before = [
        { nodeId: 'a1_hall', x: 100, y: 120 },
        { nodeId: 'a1_room101', x: 100, y: 60 },
      ];
      const after = before.map((p) => ({ ...p, x: p.x + 15, y: p.y - 5 }));
      store().setNodePositions(after);
      store().commitNodePositions(before, after);
    },
  },
  {
    name: 'перетащить один узел',
    act: () => {
      const before = [{ nodeId: 'a1_stairs', x: 300, y: 120 }];
      const after = [{ nodeId: 'a1_stairs', x: 310, y: 118 }];
      store().setNodePositions(after);
      store().commitNodePositions(before, after);
    },
  },
  {
    name: 'удалить выделенные',
    setup: () => select('a1_hall', 'a1_room101', 'a1_stairs'),
    act: () => store().deleteSelected(),
  },
  {
    name: 'дублировать выделенные',
    setup: () => {
      openFloor(1);
      select('a1_hall', 'a1_room101');
    },
    act: () => store().duplicateSelected(),
  },
  { name: 'сдвинуть выделенные', setup: () => select('a1_hall', 'a1_room101'), act: () => store().moveSelectedBy(5, -3) },
  { name: 'сделать выделенные порталами', setup: () => select('a1_hall', 'a1_room101'), act: () => store().setSelectedPortal(true) },
  {
    name: 'соединить выделенные цепочкой',
    setup: () => select('a1_entrance', 'a1_room101', 'a1_stairs'),
    act: () => store().connectSelectedChain(),
  },
  {
    name: 'вставить скопированное',
    setup: () => {
      openFloor(1);
      select('a1_hall', 'a1_room101');
      store().copySelected();
    },
    act: () => store().paste(),
  },
  {
    name: 'линия узлов',
    setup: () => {
      openFloor(1);
      store().lineSetStart(20, 20);
      store().lineSetEnd(220, 20);
      store().lineSetCount(5);
    },
    act: () => store().lineConfirm(),
  },
  {
    name: 'автоисправление',
    setup: () => {
      // Висячий сосед и несимметричное ребро — то, что чинит автоисправление.
      useEditorStore.setState((s) => {
        s.nodes.get('a1_hall')!.neighbors.push('ghost');
        s.nodes.get('a2_room201')!.neighbors.push('a2_stairs');
      });
    },
    act: () => {
      store().autoFix();
    },
  },
];

describe('отмена и повтор', () => {
  for (const c of cases) {
    it(c.name, () => {
      c.setup?.();
      const before = dataSnapshot();
      const entriesBefore = useHistoryStore.getState().entries.length;

      c.act();
      const after = dataSnapshot();
      expect(after, 'действие должно изменить данные').not.toEqual(before);
      expect(useHistoryStore.getState().entries.length).toBe(entriesBefore + 1);

      store().undo();
      expect(dataSnapshot()).toEqual(before);

      store().redo();
      expect(dataSnapshot()).toEqual(after);

      store().undo();
      expect(dataSnapshot()).toEqual(before);
    });
  }
});

describe('действия без изменений не попадают в историю', () => {
  it('ребро, которое уже есть', () => {
    store().addEdge('a1_hall', 'a1_stairs');
    expect(useHistoryStore.getState().entries).toHaveLength(0);
  });

  it('те же алиасы', () => {
    store().setNodeAliases('a1_room101', ['А-101', ' 101 ']);
    expect(useHistoryStore.getState().entries).toHaveLength(0);
  });

  it('та же заметка', () => {
    store().setNodeComment('a1_room101', 'уточнить у коменданта ');
    expect(useHistoryStore.getState().entries).toHaveLength(0);
  });
});
