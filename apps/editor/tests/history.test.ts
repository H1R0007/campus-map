import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from '../src/stores/editorStore';
import { useHistoryStore } from '../src/stores/historyStore';
import { BUILT_IN_PLACE_KINDS } from '../src/utils/placeKinds';
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
  { name: 'поставить вид места', act: () => store().setNodeCategory('a1_room101', 'toilet') },
  {
    name: 'завести свой вид точки',
    act: () =>
      store().setPlaceKinds(
        [
          ...BUILT_IN_PLACE_KINDS,
          { id: 'medpoint', name: 'Медпункт', icon: 'note', namePattern: 'Медпункт', connect: true },
        ],
        'Добавлен вид точки: Медпункт'
      ),
  },
  { name: 'сменить вид места', act: () => store().setNodeCategory('campus_gate', 'food') },
  { name: 'снять вид места', act: () => store().setNodeCategory('campus_gate', null) },
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
  {
    name: 'автоисправление повторов и координат',
    setup: () => {
      // Прежде эти исправления считались, но не применялись: применение смотрело
      // только на четыре счётчика из девяти.
      useEditorStore.setState((s) => {
        s.nodes.get('a1_hall')!.neighbors.push('a1_stairs');
        s.nodes.get('a1_room101')!.y = Number.POSITIVE_INFINITY;
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

describe('несохранённые правки', () => {
  const unsaved = () => useHistoryStore.getState().stateId() !== store().savedStateId;

  it('свежезагруженные данные считаются сохранёнными', () => {
    expect(unsaved()).toBe(false);
  });

  it('правка — есть несохранённое, отмена — снова нет', () => {
    openFloor(1);
    store().addNode(10, 10);
    expect(unsaved()).toBe(true);

    store().undo();
    expect(unsaved()).toBe(false);

    store().redo();
    expect(unsaved()).toBe(true);
  });

  it('после сохранения правок нет, а следующая — есть', () => {
    openFloor(1);
    store().addNode(10, 10);
    store().markSaved();
    expect(unsaved()).toBe(false);

    store().addNode(20, 20);
    expect(unsaved()).toBe(true);

    store().undo();
    expect(unsaved()).toBe(false);
  });

  it('другая правка вместо отменённой — состояние другое', () => {
    openFloor(1);
    store().addNode(10, 10);
    store().markSaved();
    store().undo();
    expect(unsaved()).toBe(true);

    // Позиция в истории та же, что у сохранённой, но данные другие.
    store().addNode(50, 50);
    expect(unsaved()).toBe(true);
  });
});

describe('отмена показывает, где случилась правка', () => {
  it('открывает план узла и выделяет его', () => {
    openFloor(1);
    store().removeNode('a2_room201');
    expect(store().currentFloor).toBe(1);

    store().undo();

    expect(store().currentBuilding).toBe('building_a');
    expect(store().currentFloor).toBe(2);
    expect(store().notice?.text).toContain('Отменено');
  });

  it('кнопка отмены называет действие словами', () => {
    store().addTransition('a1_room101', 'a2_room201', 'lift');
    expect(useHistoryStore.getState().getUndoDescription()).toBe('Добавлен переход: лифт');

    select('a1_hall', 'a1_room101', 'a1_stairs');
    store().moveSelectedBy(5, 0);
    expect(useHistoryStore.getState().getUndoDescription()).toBe('Перемещено: 3 узла');
  });

  it('правку на открытом плане план не переключает', () => {
    openFloor(1);
    store().updateNode('a1_hall', { isPortal: true });
    store().undo();
    expect(store().currentFloor).toBe(1);
  });
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
