import { describe, expect, it } from 'vitest';
import { portalTypeOf } from '../src/utils/portals';
import { fixtureGraph } from './helpers/graphFixture';

describe('portalTypeOf', () => {
  const graph = fixtureGraph();

  it('берёт тип перехода узла', () => {
    expect(portalTypeOf(graph, graph.getNode('a1_stairs')!)).toBe('stairs');
    expect(portalTypeOf(graph, graph.getNode('campus_entrance_a')!)).toBe('entrance');
  });

  it('у узла без переходов типа нет', () => {
    expect(portalTypeOf(graph, graph.getNode('a1_hall')!)).toBeNull();
  });
});
