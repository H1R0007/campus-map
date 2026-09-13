import { describe, expect, it } from 'vitest';
import type { MapNode } from '@campus-map/core';
import { pickNode } from '../src/utils/mapPicking';
import { node } from './helpers/graphFixture';

/**
 * Выбор узла касанием карты.
 *
 * Экранные координаты в тесте совпадают с пикселями плана: проверяется
 * правило выбора, а не проекция Leaflet.
 */

const toScreen = (n: MapNode) => ({ x: n.x, y: n.y });
const everything = () => true;

const ROOM = node('room', 'building_a', 1, 100, 100, []);
const NEAR_ROOM = node('near_room', 'building_a', 1, 110, 100, []);
const CORRIDOR = node('corridor', 'building_a', 1, 101, 100, []);

describe('pickNode', () => {
  it('выбирает ближайший узел в радиусе касания', () => {
    expect(pickNode([ROOM, NEAR_ROOM], everything, toScreen, { x: 108, y: 100 }, 32)?.id).toBe('near_room');
  });

  it('пропускает невыбираемый узел, даже если он ближе', () => {
    // Коридор без названия лежит прямо под пальцем, но выбрать его нельзя.
    const pickable = (n: MapNode) => n.id !== 'corridor';

    expect(pickNode([CORRIDOR, ROOM], pickable, toScreen, { x: 101, y: 100 }, 32)?.id).toBe('room');
  });

  it('вне радиуса ничего не выбирает', () => {
    expect(pickNode([ROOM], everything, toScreen, { x: 200, y: 200 }, 32)).toBeNull();
  });

  it('узел ровно на границе радиуса выбирается', () => {
    expect(pickNode([ROOM], everything, toScreen, { x: 132, y: 100 }, 32)?.id).toBe('room');
  });

  it('при равном расстоянии — первый по порядку: результат не зависит от случая', () => {
    const left = node('left', 'building_a', 1, 90, 100, []);
    const right = node('right', 'building_a', 1, 110, 100, []);

    expect(pickNode([left, right], everything, toScreen, { x: 100, y: 100 }, 32)?.id).toBe('left');
  });
});
