import { describe, expect, it } from 'vitest';
import { findPath } from '@campus-map/core';
import { sheetModeOf, useUiStore } from '../src/stores/uiStore';
import { fixtureGraph } from './helpers/graphFixture';

/**
 * Режим панели навигатора и измерение места, которое она занимает.
 */
describe('sheetModeOf', () => {
  const graph = fixtureGraph();
  const found = findPath(graph, 'a1_hall', 'a2_room201');
  const notFound = findPath(graph, 'a1_hall', 'a2_room201', { allowStairs: false });

  it('выбранное место важнее маршрута и навигации: человек только что его выбрал', () => {
    expect(sheetModeOf({ selectedNodeId: 'a1_hall', currentRoute: found, stepIndex: 1 })).toBe('place');
  });

  it('шаг найденного маршрута — навигация', () => {
    expect(sheetModeOf({ selectedNodeId: null, currentRoute: found, stepIndex: 0 })).toBe('navigate');
  });

  it('маршрут — и найденный, и не найденный: причину тоже нужно показать', () => {
    expect(sheetModeOf({ selectedNodeId: null, currentRoute: found, stepIndex: null })).toBe('route');
    expect(sheetModeOf({ selectedNodeId: null, currentRoute: notFound, stepIndex: 0 })).toBe('route');
  });

  it('без места и маршрута — поиск', () => {
    expect(sheetModeOf({ selectedNodeId: null, currentRoute: null, stepIndex: null })).toBe('idle');
  });
});

describe('setMapObstruction', () => {
  it('те же числа не создают новый объект: подгонка карты не пересчитывается зря', () => {
    useUiStore.getState().setMapObstruction({ bottom: 120, left: 0 });
    const first = useUiStore.getState().mapObstruction;

    useUiStore.getState().setMapObstruction({ bottom: 120, left: 0 });

    expect(useUiStore.getState().mapObstruction).toBe(first);
  });
});
