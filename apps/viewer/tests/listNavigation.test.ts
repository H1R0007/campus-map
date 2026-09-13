import { describe, expect, it } from 'vitest';
import { moveActiveOption } from '../src/utils/listNavigation';

/**
 * Движение по подсказкам стрелками.
 */
describe('moveActiveOption', () => {
  it('«вниз» идёт по списку и с последней подсказки возвращается на первую', () => {
    expect(moveActiveOption(-1, 3, 'down')).toBe(0);
    expect(moveActiveOption(0, 3, 'down')).toBe(1);
    expect(moveActiveOption(2, 3, 'down')).toBe(0);
  });

  it('«вверх» из невыбранного состояния и с первой подсказки ведёт на последнюю', () => {
    expect(moveActiveOption(-1, 3, 'up')).toBe(2);
    expect(moveActiveOption(0, 3, 'up')).toBe(2);
    expect(moveActiveOption(2, 3, 'up')).toBe(1);
  });

  it('без подсказок ничего не выбрано', () => {
    expect(moveActiveOption(0, 0, 'down')).toBe(-1);
    expect(moveActiveOption(-1, 0, 'up')).toBe(-1);
  });

  it('индекс за концом укоротившегося списка не выводит за его пределы', () => {
    // Список сократился, пока выбранной была пятая подсказка.
    expect(moveActiveOption(4, 2, 'down')).toBe(0);
    expect(moveActiveOption(4, 2, 'up')).toBe(1);
  });
});
