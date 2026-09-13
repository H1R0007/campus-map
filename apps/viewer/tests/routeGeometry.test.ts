import { describe, expect, it } from 'vitest';
import { scopeOfFloor } from '@campus-map/core';
import { visiblePolylines } from '../src/utils/routeGeometry';
import { fixtureGraph } from './helpers/graphFixture';

/**
 * Разбиение маршрута на видимые отрезки.
 *
 * Именно здесь маршрут исчезал с экрана: в виде кампуса узлы корпусов не
 * попадают в область видимости, и от пути не остаётся ни одного отрезка.
 */

const graph = fixtureGraph();

const FULL_PATH = [
  'campus_gate',
  'campus_entrance_a',
  'a1_entrance',
  'a1_hall',
  'a1_stairs',
  'a2_stairs',
  'a2_room201',
];

describe('visiblePolylines', () => {
  it('на территории кампуса показывает только уличную часть', () => {
    const segments = visiblePolylines(FULL_PATH, graph, scopeOfFloor(null, null));

    expect(segments).toEqual([
      [
        [750, 600],
        [300, 200],
      ],
    ]);
  });

  it('на этаже показывает только его часть маршрута', () => {
    const segments = visiblePolylines(FULL_PATH, graph, scopeOfFloor('building_a', 1));

    // Три узла первого этажа подряд — один отрезок.
    expect(segments).toHaveLength(1);
    expect(segments[0]).toHaveLength(3);
  });

  it('одиночная видимая точка отрезком не считается', () => {
    // На втором этаже маршрут проходит через два узла, но если взять только
    // один из них, линии быть не должно.
    const segments = visiblePolylines(
      ['a1_hall', 'a2_stairs', 'a1_stairs'],
      graph,
      scopeOfFloor('building_a', 2)
    );

    expect(segments).toEqual([]);
  });

  it('разрывает линию на узлах чужого этажа', () => {
    const path = ['a1_hall', 'a1_stairs', 'a2_stairs', 'a2_room201', 'a2_stairs', 'a1_stairs', 'a1_hall'];
    const segments = visiblePolylines(path, graph, scopeOfFloor('building_a', 1));

    // Заход на первый этаж дважды — два отдельных отрезка.
    expect(segments).toHaveLength(2);
  });

  it('пропускает узлы, которых нет в графе', () => {
    const segments = visiblePolylines(
      ['a1_hall', 'ghost', 'a1_stairs'],
      graph,
      scopeOfFloor('building_a', 1)
    );

    // Несуществующий узел не должен разрывать линию: он не «чужой этаж»,
    // его просто нет, и молча выбросить его правильнее, чем нарисовать разрыв.
    expect(segments).toHaveLength(1);
    expect(segments[0]).toHaveLength(2);
  });

  it('на пустом пути возвращает пустой список', () => {
    expect(visiblePolylines([], graph, scopeOfFloor('building_a', 1))).toEqual([]);
  });
});
