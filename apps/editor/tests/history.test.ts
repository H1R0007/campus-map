import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from '../src/stores/editorStore';
import { useHistoryStore } from '../src/stores/historyStore';
import { placementPoint } from '../src/stores/editor/editSlice';
import { datasetFromState } from '../src/stores/editor/graphState';
import { datasetFiles } from '../src/utils/datasetFiles';
import { BUILT_IN_PLACE_KINDS } from '../src/utils/placeKinds';
import { dataSnapshot, fixtureDataset, loadFixture, openFloor, store } from './helpers/fixture';

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
  { name: 'удалить узел с видом места и переводом', act: () => store().removeNode('campus_gate') },
  {
    name: 'удалить выделенные с видом места и переводом',
    setup: () => select('campus_gate', 'a1_room101'),
    act: () => store().deleteSelected(),
  },
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
  { name: 'переименовать id точки', act: () => store().renameNode('a1_room101', 'a1_toilet_east') },
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

describe('переименование id', () => {
  it('чинит ссылки: связи, название, перевод, вид места', () => {
    store().setNodeCategory('a1_room101', 'toilet');

    expect(store().renameNode('a1_room101', 'a1_room101a')).toBe(true);

    expect(store().nodes.has('a1_room101')).toBe(false);
    expect(store().nodes.get('a1_room101a')?.id).toBe('a1_room101a');
    expect(store().nodes.get('a1_hall')?.neighbors).toContain('a1_room101a');
    expect(store().nodes.get('a1_hall')?.neighbors).not.toContain('a1_room101');
    expect(store().aliases.get('a1_room101a')).toEqual(['А-101', '101']);
    expect(store().aliasCategories.get('a1_room101a')).toBe('toilet');
    expect(store().aliasTranslations.get('a1_room101a')).toBeDefined();
  });

  it('переход переезжает на новый id', () => {
    store().renameNode('a1_stairs', 'a1_stairs_main');

    expect(store().transitions).toContainEqual({ fromNode: 'a1_stairs_main', toNode: 'a2_stairs', type: 'stairs' });
    expect(store().transitions.some((t) => t.fromNode === 'a1_stairs' || t.toNode === 'a1_stairs')).toBe(false);
  });

  it('занятый id, чужие буквы и пустое отклоняются без записи в историю', () => {
    expect(store().renameNode('a1_hall', 'a1_stairs')).toBe(false);
    expect(store().renameNode('a1_hall', 'Холл 1')).toBe(false);
    expect(store().renameNode('a1_hall', '   ')).toBe(false);

    expect(store().nodes.has('a1_hall')).toBe(true);
    expect(useHistoryStore.getState().entries).toHaveLength(0);
  });

  it('выделенная точка остаётся выделенной', () => {
    select('a1_hall');
    store().renameNode('a1_hall', 'a1_lobby');

    expect([...store().selectedNodeIds]).toEqual(['a1_lobby']);
  });
});

/**
 * id новой точки — половина разметки: по нему точку находят в файлах данных.
 * Автоматический `building_a_1_node_7` не говорил ничего, и в датасете
 * однажды остался мусорный узел, который никто не опознал (запись 10).
 */
describe('id новых точек говорят, что это', () => {
  it('точка кисти названа по виду места и плану', () => {
    openFloor(1);
    store().setPlaceKinds([...BUILT_IN_PLACE_KINDS], 'Виды точек');
    store().setActiveKind('toilet');

    expect(store().placeKindNode(50, 50)).toBe('a1_toilet');
    expect(store().placeKindNode(80, 50)).toBe('a1_toilet_2');
  });

  it('точка без вида названа по плану', () => {
    openFloor(1);
    expect(store().addNode(10, 10)).toBe('a1_node');
  });

  it('копия на другом этаже сохраняет название оригинала', () => {
    openFloor(1);
    select('a1_room101');
    store().copySelected();
    openFloor(2);
    store().paste();

    expect(store().nodes.has('a2_room101')).toBe(true);
  });

  it('копия рядом с оригиналом получает номер', () => {
    openFloor(1);
    select('a1_room101');
    store().duplicateSelected();

    expect(store().nodes.has('a1_room101_2')).toBe(true);
  });
});

/** Все файлы датасета так, как их запишет сохранение. */
const savedFiles = () => datasetFiles(datasetFromState(store()));

/** План точки: корпус и этаж. */
const planOf = (id: string) => {
  const node = store().nodes.get(id);
  return node ? `${node.building}:${node.floor}` : 'нет точки';
};

/** Связи, которые идут на другой план, — ребро сквозь перекрытие. */
const crossPlanLinks = () =>
  [...store().nodes.values()].flatMap((node) =>
    node.neighbors.filter((other) => planOf(other) !== planOf(node.id)).map((other) => `${node.id}—${other}`)
  );

const useKind = (kindId: string) => {
  store().setPlaceKinds([...BUILT_IN_PLACE_KINDS], 'Виды точек');
  store().setActiveKind(kindId);
};

describe('удалённая точка уносит название, перевод и вид места', () => {
  it('отмена удаления возвращает вид места, даже если id успела занять новая точка', () => {
    openFloor(1);
    useKind('toilet');
    const toilet = store().placeKindNode(380, 20);
    expect(store().aliasCategories.get(toilet)).toBe('toilet');

    store().removeNode(toilet);
    expect(store().placeKindNode(380, 60)).toBe(toilet);
    store().undo();
    store().undo();

    expect(store().aliasCategories.get(toilet)).toBe('toilet');
  });

  it('точка под id удалённой не наследует её перевод и вид места', () => {
    store().setNodeCategory('a1_room101', 'toilet');
    store().removeNode('a1_room101');
    expect(store().renameNode('a1_hall', 'a1_room101')).toBe(true);

    expect(store().aliasTranslations.get('a1_room101')).toBeUndefined();
    expect(store().aliasCategories.get('a1_room101')).toBeUndefined();
  });
});

describe('щелчок кистью связывает точки только в пределах плана', () => {
  it('у стопки выбрана и возвращена точка открытого этажа', () => {
    openFloor(2);
    useKind('stairs');
    const id = store().placeKindNode(350, 180);

    expect(planOf(id)).toBe('building_a:2');
    expect([...store().selectedNodeIds]).toEqual([id]);
  });

  it('Shift+щелчок на другом этаже не тянет связь к точке прежнего этажа', () => {
    openFloor(1);
    useKind('toilet');
    store().placeKindNode(380, 20);
    openFloor(2);
    store().setActiveKind('corridor');
    store().placeKindNode(380, 20, { linkToLast: true });

    expect(crossPlanLinks()).toEqual([]);
  });

  it('стопка с Shift связывает с предыдущей только точку своего этажа', () => {
    openFloor(1);
    useKind('corridor');
    const corridor = store().placeKindNode(380, 190);
    store().setActiveKind('stairs');
    const stairs = store().placeKindNode(390, 180, { linkToLast: true });

    expect(crossPlanLinks()).toEqual([]);
    expect(store().nodes.get(stairs)?.neighbors).toContain(corridor);
  });

  it('стопка у корпуса без описанных этажей ставит точку на открытом этаже', () => {
    useEditorStore.setState((s) => {
      s.buildingMetas.set('building_b', { id: 'building_b', name: 'Корпус Б', floors: [] });
    });
    useEditorStore.setState({ currentBuilding: 'building_b', currentFloor: 1 });
    useKind('stairs');

    const id = store().placeKindNode(50, 50);
    expect(planOf(id)).toBe('building_b:1');
  });
});

describe('отмена щелчка кистью продолжает линию', () => {
  it('после отмены последней точки коридора следующая цепляется к предыдущей, а не к ближайшей', () => {
    openFloor(1);
    useKind('corridor');
    store().placeKindNode(150, 190);
    const previous = store().placeKindNode(200, 190);
    store().placeKindNode(240, 190);
    store().undo();

    // Вплотную к лестнице: без восстановления линии точка прицепилась бы к ней.
    const next = store().placeKindNode(296, 126, { align: false });
    expect(store().nodes.get(next)?.neighbors).toEqual([previous]);
  });
});

describe('переименование не переставляет записи в файлах', () => {
  it('переименование и отмена дают те же файлы', () => {
    const before = savedFiles();
    store().renameNode('campus_gate', 'campus_main_gate');
    store().undo();

    expect(savedFiles()).toEqual(before);
  });

  it('переименованная запись названий остаётся на своём месте', () => {
    const order = () => JSON.parse(savedFiles().get('aliases.json')!).aliases.map((entry: { id: string }) => entry.id);
    const before = order();
    store().renameNode('campus_gate', 'campus_main_gate');

    expect(order()).toEqual(before.map((id: string) => (id === 'campus_gate' ? 'campus_main_gate' : id)));
  });
});

describe('каталог видов', () => {
  it('последний вид не удаляется: пустой каталог означал бы «файла нет»', () => {
    store().setPlaceKinds([{ id: 'medpoint', name: 'Медпункт' }], 'Свой вид');
    const entries = useHistoryStore.getState().entries.length;

    store().setPlaceKinds([], 'Удалены все виды');

    expect(store().placeKinds.map((kind) => kind.id)).toEqual(['medpoint']);
    expect(useHistoryStore.getState().entries).toHaveLength(entries);
  });
});

describe('черновик прежней версии редактора', () => {
  it('без каталога видов открывается, а не падает', () => {
    const old: Partial<ReturnType<typeof fixtureDataset>> = fixtureDataset();
    delete old.placeKinds;

    expect(() => store().loadData(old as ReturnType<typeof fixtureDataset>)).not.toThrow();
    expect(store().placeKinds).toEqual([]);
    expect(store().nodes.has('a1_hall')).toBe(true);
  });
});

describe('призрак точки показывает, куда она встанет', () => {
  const withGrid = () =>
    useEditorStore.setState((s) => {
      s.gridSettings.enabled = true;
      s.gridSettings.snap = true;
      s.gridSettings.size = 20;
      s.gridSettings.alignToNeighbours = true;
    });

  it('сетка уводит точку с линии соседа — линии выравнивания нет, место то же', () => {
    openFloor(1);
    withGrid();
    // Соседи стоят мимо клеток, на x = 103: щелчок у x = 105 выровнялся бы
    // по ним, но сетка с клеткой 20 ставит точку на 100.
    useEditorStore.setState((s) => {
      s.nodes.get('a1_hall')!.x = 103;
      s.nodes.get('a1_room101')!.x = 103;
    });
    const ghost = placementPoint(store(), 105, 157);
    useKind('corridor');
    const id = store().placeKindNode(105, 157);

    const node = store().nodes.get(id)!;
    expect({ x: node.x, y: node.y }).toEqual({ x: ghost.x, y: ghost.y });
    expect(ghost.x).toBe(100);
    expect(ghost.alignedX, 'линия ряда показана, хотя точка в ряд не встанет').toBeNull();
  });

  it('без выбранного вида точка встаёт туда же, куда показывал призрак', () => {
    openFloor(1);
    useEditorStore.setState((s) => {
      s.gridSettings.alignToNeighbours = true;
    });
    const ghost = placementPoint(store(), 103, 157);
    expect(ghost.alignedX).not.toBeNull();

    store().setActiveKind('нет-такого-вида');
    const id = store().placeKindNode(103, 157);
    const node = store().nodes.get(id)!;

    expect({ x: node.x, y: node.y }).toEqual({ x: ghost.x, y: ghost.y });
  });
});
