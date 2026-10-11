import { describe, expect, it } from 'vitest';
import type { MapNode, Transition } from '@campus-map/core';
import { passagesFrom, photoCoverage } from '../src/utils/photoCoverage';

/** Где не хватает фото и ориентиров — вкладка «Проверка → Фото» (запись 87). */

function node(id: string, neighbors: string[], extra: Partial<MapNode> = {}): MapNode {
  return { id, x: 0, y: 0, floor: 1, building: 'b', isPortal: false, neighbors, ...extra };
}

// Коридор c1—c2—c3—c4; у c2 дверь в аудиторию (тупик), у c3 — ветка c5—c6 и
// лестница на c4.
const NODES = new Map(
  [
    node('c1', ['c2', 'hall']),
    node('c2', ['c1', 'c3', 'room']),
    node('room', ['c2']),
    node('c3', ['c2', 'c4', 'c5']),
    node('c5', ['c3', 'c6']),
    node('c6', ['c5']),
    node('c4', ['c3', 'stairs']),
    node('stairs', ['c4'], { isPortal: true }),
    node('gate', ['door'], { building: 'CAMPUS', floor: 0 }),
    node('door', ['gate'], { building: 'CAMPUS', floor: 0, isPortal: true }),
    node('hall', ['c1'], { isPortal: true }),
  ].map((n) => [n.id, n])
);
const TRANSITIONS: Transition[] = [{ fromNode: 'door', toNode: 'hall', type: 'entrance' }];

describe('passagesFrom', () => {
  it('тупиковая дверь в аудиторию проходом не считается', () => {
    expect(passagesFrom(NODES.get('c2')!, NODES)).toBe(2);
  });

  it('ветка коридора и переход — проходы', () => {
    expect(passagesFrom(NODES.get('c3')!, NODES)).toBe(3);
    expect(passagesFrom(NODES.get('c4')!, NODES)).toBe(2);
  });
});

describe('photoCoverage', () => {
  it('развилка без ориентира, вход снаружи без фото, место без фото', () => {
    const coverage = photoCoverage(NODES, TRANSITIONS, new Map([['room', ['А-101']]]));

    expect(coverage.forks).toEqual({ missing: ['c3'], total: 1 });
    expect(coverage.entrances).toEqual({ missing: ['door'], total: 1 });
    expect(coverage.places).toEqual({ missing: ['room'], total: 1 });
  });

  it('ориентир и фото закрывают строки', () => {
    const done = new Map(NODES);
    done.set('c3', { ...NODES.get('c3')!, landmark: { name: 'Автомат' } });
    done.set('door', { ...NODES.get('door')!, photos: [{ file: '1111111111111111.webp', width: 10, height: 10 }] });

    const coverage = photoCoverage(done, TRANSITIONS, new Map());
    expect(coverage.forks.missing).toEqual([]);
    expect(coverage.entrances.missing).toEqual([]);
  });
});
