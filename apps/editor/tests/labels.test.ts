import { describe, expect, it } from 'vitest';
import { nodesCount } from '../src/utils/labels';

describe('nodesCount', () => {
  it.each([
    [1, '1 узел'],
    [2, '2 узла'],
    [4, '4 узла'],
    [5, '5 узлов'],
    [11, '11 узлов'],
    [12, '12 узлов'],
    [14, '14 узлов'],
    [21, '21 узел'],
    [22, '22 узла'],
    [111, '111 узлов'],
    [0, '0 узлов'],
  ])('%i → «%s»', (count, text) => {
    expect(nodesCount(count)).toBe(text);
  });
});
