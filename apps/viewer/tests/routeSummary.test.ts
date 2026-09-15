import { describe, expect, it } from 'vitest';
import type { PathResult } from '@campus-map/core';
import { findPath } from '@campus-map/core';
import { routeSummary } from '../src/utils/routeSummary';
import { pluralize } from '../src/i18n/plural';
import { fixtureGraph } from './helpers/graphFixture';

/**
 * Сводка маршрута одной строкой.
 */

const graph = fixtureGraph();

function metric(route: PathResult, durationSeconds: number, distanceMeters: number): PathResult {
  return { ...route, durationSeconds, distanceMeters };
}

describe('routeSummary', () => {
  it('в метрическом режиме — время и длина с округлением до десятков метров', () => {
    const route = metric(findPath(graph, 'campus_gate', 'a2_room201'), 301, 427);

    expect(routeSummary(graph, route, 'ru')).toBe('~6\u00a0мин · 430\u00a0м');
    expect(routeSummary(graph, route, 'en')).toBe('~6\u00a0min · 430\u00a0m');
  });

  it('короткая длина не округляется до нуля', () => {
    const route = metric(findPath(graph, 'a1_hall', 'a1_stairs'), 5, 4.4);

    expect(routeSummary(graph, route, 'ru')).toBe('~1\u00a0мин · 4\u00a0м');
  });

  it('в пиксельном режиме — корпуса и этажи пути, территория не считается', () => {
    // Ворота → корпус А этаж 1 → этаж 2: один корпус, два этажа.
    const route = findPath(graph, 'campus_gate', 'a2_room201');

    expect(routeSummary(graph, route, 'ru')).toBe('2 этажа');
    expect(routeSummary(graph, route, 'en')).toBe('2 floors');
  });

  it('маршрут по территории — просто «Кампус»', () => {
    const route = findPath(graph, 'campus_gate', 'campus_entrance_a');

    expect(routeSummary(graph, route, 'ru')).toBe('Кампус');
  });
});

describe('pluralize', () => {
  const floors = { one: 'этаж', few: 'этажа', many: 'этажей', other: 'этажа' };

  it('русские формы: 1 этаж, 2 этажа, 5 этажей, 11 этажей, 21 этаж', () => {
    expect([1, 2, 5, 11, 21].map((n) => `${n} ${pluralize('ru', n, floors)}`)).toEqual([
      '1 этаж',
      '2 этажа',
      '5 этажей',
      '11 этажей',
      '21 этаж',
    ]);
  });

  it('английские формы: 1 floor, 2 floors', () => {
    const words = { one: 'floor', other: 'floors' };

    expect([1, 2].map((n) => `${n} ${pluralize('en', n, words)}`)).toEqual(['1 floor', '2 floors']);
  });
});
