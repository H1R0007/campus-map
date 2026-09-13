import { beforeEach, describe, expect, it } from 'vitest';
import { useMapStore } from '../src/stores/mapStore';
import { fixtureGraph } from './helpers/graphFixture';

/**
 * Место, выбранное нажатием на карту.
 */
describe('выбранное место', () => {
  beforeEach(() => {
    useMapStore.setState({ activeFloor: { buildingId: 'building_a', floor: 1 }, selectedNodeId: null });
  });

  it('смена этажа снимает выбор: на другом плане этого места нет', () => {
    useMapStore.getState().selectNode('a1_hall');
    useMapStore.getState().setActiveFloor('building_a', 2);

    expect(useMapStore.getState().selectedNodeId).toBeNull();
  });

  it('возврат на территорию тоже снимает выбор', () => {
    useMapStore.getState().selectNode('a1_hall');
    useMapStore.getState().clearActiveFloor();

    expect(useMapStore.getState().selectedNodeId).toBeNull();
  });

  it('показ узла открывает его этаж или территорию, неизвестный узел вид не меняет', () => {
    // Путь ссылки «вы здесь» без второй точки: маршрута нет, карта должна
    // сама перейти туда, где человек стоит.
    useMapStore.setState({ graph: fixtureGraph() });

    useMapStore.getState().showNode('a2_room201');
    expect(useMapStore.getState().activeFloor).toEqual({ buildingId: 'building_a', floor: 2 });

    useMapStore.getState().showNode('no_such_node');
    expect(useMapStore.getState().activeFloor).toEqual({ buildingId: 'building_a', floor: 2 });

    useMapStore.getState().showNode('campus_gate');
    expect(useMapStore.getState().activeFloor).toBeNull();
  });

  it('повторный выбор того же этажа выбор не снимает', () => {
    // Построение маршрута переводит карту на этаж старта — если это текущий
    // этаж, ничего не меняется, и выбор пропадать не должен.
    useMapStore.getState().selectNode('a1_hall');
    useMapStore.getState().setActiveFloor('building_a', 1);

    expect(useMapStore.getState().selectedNodeId).toBe('a1_hall');
  });
});
