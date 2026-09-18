import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from '../src/stores/editorStore';
import { floorNodesOf } from '../src/stores/editor/dataSlice';
import { planStats } from '../src/utils/planStats';
import { loadFixture, openFloor, store } from './helpers/fixture';

beforeEach(() => loadFixture());

const statsOf = (building: string | null, floor: number | null) => {
  const st = store();
  return planStats(floorNodesOf(st.nodes, building, floor, true), st.aliases, st.transitions);
};

describe('planStats', () => {
  it('считает узлы, названия, связи и переходы плана', () => {
    const stats = statsOf('building_a', 1);
    expect(stats.nodes).toBe(4);
    expect(stats.named).toBe(1);
    expect(stats.links).toBe(3);
    expect(stats.isolated).toBe(0);
    // Вход с территории и лестница на второй этаж.
    expect(stats.transitions).toBe(2);
    expect(stats.parts).toBe(1);
  });

  it('узел без связей — отдельная часть плана', () => {
    openFloor(1);
    store().addNode(380, 20);
    const stats = statsOf('building_a', 1);
    expect(stats.isolated).toBe(1);
    expect(stats.parts).toBe(2);
  });

  it('удалённая связь делит план на части', () => {
    store().removeEdge('a1_hall', 'a1_room101');
    expect(statsOf('building_a', 1).parts).toBe(2);
  });

  it('связь, записанная у одного конца, всё равно соединяет части', () => {
    // Обратная сторона связи потеряна: у аудитории зал есть, у зала аудитории
    // нет. Действия редактора такую связь не создают, поэтому — прямо в данные.
    useEditorStore.setState((s) => {
      s.nodes.get('a1_hall')!.neighbors = ['a1_entrance', 'a1_stairs'];
    });
    expect(store().nodes.get('a1_room101')!.neighbors).toContain('a1_hall');
    expect(statsOf('building_a', 1).parts).toBe(1);
  });
});
