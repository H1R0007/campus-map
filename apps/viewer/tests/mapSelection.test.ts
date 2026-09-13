import { beforeEach, describe, expect, it } from 'vitest';
import { useMapStore } from '../src/stores/mapStore';

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

  it('повторный выбор того же этажа выбор не снимает', () => {
    // Построение маршрута переводит карту на этаж старта — если это текущий
    // этаж, ничего не меняется, и выбор пропадать не должен.
    useMapStore.getState().selectNode('a1_hall');
    useMapStore.getState().setActiveFloor('building_a', 1);

    expect(useMapStore.getState().selectedNodeId).toBe('a1_hall');
  });
});
