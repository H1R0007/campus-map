import { beforeEach, describe, expect, it } from 'vitest';
import type { PlanSource } from '@campus-map/core';
import { applySimilarity, pageToPlan } from '../src/import/planGeometry';
import { alignmentFit } from '../src/stores/editor/alignSlice';
import { useEditorStore } from '../src/stores/editorStore';
import { useHistoryStore } from '../src/stores/historyStore';
import { fixtureDataset, loadFixture, store } from './helpers/fixture';

/**
 * Совмещение точек с новым планом (запись 49): пары «точка — её место»
 * двигают все точки плана одним подобием; план из того же исходника
 * пересчитывает точки сам.
 */

beforeEach(() => loadFixture());

const position = (id: string) => {
  const node = store().nodes.get(id)!;
  return { x: node.x, y: node.y };
};

describe('пары точек', () => {
  it('новый план вдвое крупнее и сдвинут — две пары находят это точно', () => {
    const pairs = [
      { nodeId: 'a1_entrance', to: { x: 40 * 2 + 30, y: 180 * 2 + 10 } },
      { nodeId: 'a1_stairs', to: { x: 300 * 2 + 30, y: 120 * 2 + 10 } },
    ];
    const fit = alignmentFit(pairs, store().nodes)!;
    expect(fit.rms).toBeCloseTo(0, 6);
    const hall = applySimilarity(fit.transform, position('a1_hall'));
    expect(hall.x).toBeCloseTo(230, 6);
    expect(hall.y).toBeCloseTo(250, 6);
  });

  it('щелчки: точка, затем место; та же точка второй раз — новое место', () => {
    store().startAlignment([{ building: 'building_a', floor: 1 }]);
    expect([store().currentBuilding, store().currentFloor]).toEqual(['building_a', 1]);

    store().alignPlace(10, 10); // места без точки — не пара
    expect(store().alignment!.pairs).toEqual([]);

    store().alignPickNode('a2_corridor'); // точка другого этажа — не с этого плана
    expect(store().alignment!.pending).toBeNull();

    store().alignPickNode('a1_entrance');
    store().alignPlace(110, 370);
    store().alignPickNode('a1_entrance');
    store().alignPlace(111, 371);
    expect(store().alignment!.pairs).toEqual([{ nodeId: 'a1_entrance', to: { x: 111, y: 371 } }]);
  });

  it('«Применить» двигает все точки плана одной правкой, другие этажи не трогает; отмена возвращает', () => {
    const before = [...store().nodes.values()].map((node) => ({ ...node }));
    store().startAlignment([{ building: 'building_a', floor: 1 }, { building: 'building_a', floor: 2 }]);
    store().alignPickNode('a1_entrance');
    store().alignPlace(110, 370);
    store().alignPickNode('a1_stairs');
    store().alignPlace(630, 250);
    store().applyAlignment();

    expect(position('a1_hall')).toEqual({ x: 230, y: 250 });
    expect(position('a2_corridor')).toEqual({ x: 200, y: 120 });
    expect(useHistoryStore.getState().entries).toHaveLength(1);
    expect(useHistoryStore.getState().entries[0].description).toBe('Точки совмещены с планом: Корпус А, этаж 1');
    // Следующий план из очереди открыт.
    expect(store().alignment?.plan).toEqual({ building: 'building_a', floor: 2 });
    expect(store().currentFloor).toBe(2);

    store().cancelAlignment();
    store().undo();
    expect([...store().nodes.values()].map((node) => ({ ...node }))).toEqual(before);
  });

  it('одной пары мало — «Применить» ничего не делает', () => {
    store().startAlignment([{ building: 'building_a', floor: 1 }]);
    store().alignPickNode('a1_entrance');
    store().alignPlace(110, 370);
    store().applyAlignment();
    expect(useHistoryStore.getState().entries).toEqual([]);
    expect(store().alignment).not.toBeNull();
  });

  it('«Оставить как есть» — к следующему плану, без правки', () => {
    store().startAlignment([{ building: 'building_a', floor: 1 }]);
    store().skipAlignment();
    expect(store().alignment).toBeNull();
    expect(useHistoryStore.getState().entries).toEqual([]);
  });
});

describe('план из того же исходника', () => {
  it('другая обрезка того же листа — точки пересчитаны сами, совмещать нечего', () => {
    const source: PlanSource = {
      file: '0123456789abcdef.pdf',
      page: 1,
      pageSize: { width: 842, height: 595 },
      crop: { x: 100, y: 100, width: 400, height: 200 },
    };
    const dataset = fixtureDataset();
    dataset.buildingMetas[0].floors[0] = { ...dataset.buildingMetas[0].floors[0], source, mapSize: { width: 400, height: 200 } };
    loadFixture(dataset);

    const recropped: PlanSource = { ...source, crop: { x: 50, y: 80, width: 600, height: 300 } };
    const mapSize = { width: 1200, height: 600 };
    const { problem, align } = store().importPlans({
      floors: [{ building: { id: 'building_a' }, floor: 1, plan: { key: 'sha1:' + '2'.repeat(40), format: 'png', mapSize, source: recropped } }],
    });

    expect(problem).toBeNull();
    expect(align).toEqual([]);
    // Точка страницы та же: старый пиксель → страница → новый пиксель.
    const page = applySimilarity({ a: 1, b: 0, tx: 100, ty: 100 }, { x: 100, y: 120 });
    const expected = applySimilarity(pageToPlan(recropped, mapSize), page);
    expect(position('a1_hall')).toEqual({ x: Math.round(expected.x * 10) / 10, y: Math.round(expected.y * 10) / 10 });
    expect(position('a1_hall')).toEqual({ x: 300, y: 280 });
  });
});

it('новые данные закрывают совмещение', () => {
  store().startAlignment([{ building: 'building_a', floor: 1 }]);
  useEditorStore.getState().loadData(fixtureDataset());
  expect(store().alignment).toBeNull();
});

it('отмена закрывает совмещение: оно было про план, каким он был', () => {
  store().setPlan('building_a', 1, { key: 'sha1:' + '3'.repeat(40), format: 'png', mapSize: { width: 800, height: 400 } });
  store().startAlignment([{ building: 'building_a', floor: 1 }]);
  store().undo();
  expect(store().alignment).toBeNull();
});
