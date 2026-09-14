import { describe, expect, it } from 'vitest';
import type { RouteStep, RouteStepKind } from '../src/utils/routeInstructions';
import { remainingSeconds } from '../src/utils/routeSummary';

/** Сколько осталось идти — в шапке режима «в пути» (запись 23). */

function step(kind: RouteStepKind, durationSeconds: number | null): RouteStep {
  return {
    kind,
    title: kind,
    place: '',
    transition: null,
    scope: { mode: 'campus' },
    distanceMeters: null,
    durationSeconds,
    pathRange: [0, 0],
  };
}

describe('remainingSeconds', () => {
  const metric = [step('start', null), step('walk', 60), step('transition', 30), step('walk', 90)];

  it('время текущего и следующих шагов', () => {
    expect(remainingSeconds(metric, 0)).toBe(180);
    expect(remainingSeconds(metric, 2)).toBe(120);
    expect(remainingSeconds(metric, 3)).toBe(90);
  });

  it('без метрики — null: выдуманное время хуже отсутствующего', () => {
    expect(remainingSeconds([step('start', null), step('walk', null)], 0)).toBeNull();
  });

  it('на прибытии идти некуда — null, а не «~1 мин»', () => {
    expect(remainingSeconds([step('start', null), step('transition', 30), step('arrive', null)], 2)).toBeNull();
  });
});
