import { describe, expect, it } from 'vitest';
import type { MapNode } from '@campus-map/core';
import { passagesOf, sideLabel, stepSentence } from '../src/utils/landmarkPassages';

/** Проходы через ориентир в карточке точки (запись 87). */

function node(id: string, x: number, y: number, neighbors: string[]): MapNode {
  return { id, x, y, floor: 1, building: 'b', isPortal: false, neighbors };
}

// Т-перекрёсток: коридор запад—восток, ветка на север; за веткой — лестница.
const NODES = new Map(
  [
    node('w', 0, 100, ['l']),
    node('l', 100, 100, ['w', 'e', 'n']),
    node('e', 200, 100, ['l', 'room']),
    node('room', 300, 100, ['e']),
    node('n', 100, 0, ['l', 'stairs']),
    node('stairs', 100, -50, ['n']),
  ].map((n) => [n.id, n])
);
const ALIASES = new Map([['room', ['А-102']]]);

describe('passagesOf', () => {
  it('каждый проход через точку с расчётом навигатора', () => {
    const passages = passagesOf('l', NODES, null, new Map());
    expect(passages).toHaveLength(6);
    expect(passages.find((p) => p.from === 'w' && p.to === 'n')?.auto).toBe('left');
    expect(passages.find((p) => p.from === 'n' && p.to === 'w')?.auto).toBe('right');
  });
});

describe('sideLabel', () => {
  it('безымянная точка коридора — по первому названию дальше по коридору', () => {
    expect(sideLabel('e', 'l', NODES, ALIASES)).toBe('«А-102»');
  });

  it('точка перехода — видом перехода', () => {
    expect(sideLabel('n', 'l', NODES, ALIASES, (id) => (id === 'stairs' ? 'лестница' : null))).toBe('лестница');
  });

  it('ничего не нашлось — id соседней точки', () => {
    expect(sideLabel('w', 'l', NODES, ALIASES)).toBe('точка w');
  });

  it('за развилкой — ближайшее название в ту сторону, а не через ориентир назад', () => {
    const fork = new Map(NODES);
    fork.set('w', node('w', 0, 100, ['l', 'w2', 'canteen']));
    fork.set('canteen', node('canteen', 0, 150, ['w']));
    fork.set('w2', node('w2', -100, 100, ['w']));
    expect(sideLabel('w', 'l', fork, new Map([...ALIASES, ['canteen', ['Столовая']]]))).toBe('«Столовая»');
  });
});

describe('stepSentence', () => {
  it('фраза с заглавной и действие', () => {
    expect(stepSentence('у кофейного автомата', 'left')).toBe('У кофейного автомата поверните налево');
  });
});
