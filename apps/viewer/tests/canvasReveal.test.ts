import { describe, expect, it } from 'vitest';
import {
  FOCUS_PIXELS_PER_METER,
  HIDDEN_SHARE,
  REVEALED_SHARE,
  REVEAL_END_SHARE,
  REVEAL_START_SHARE,
  focusSpan,
  isRevealedAt,
  revealAmount,
  screenShare,
} from '../src/utils/canvasReveal';

describe('focusSpan', () => {
  it('телефон: свободно 262 × 550 px — прежние 30 метров вокруг места', () => {
    expect(focusSpan(30, 262, 550)).toBe(30);
  });

  it('монитор: свободно 900 × 764 px — сколько помещается при читаемой крупности', () => {
    expect(focusSpan(30, 900, 764)).toBeCloseTo(764 / FOCUS_PIXELS_PER_METER, 9);
    expect(focusSpan(30, 900, 764)).toBeGreaterThan(60);
  });

  it('по меньшей стороне свободного места: узкая полоса не отдаляет', () => {
    expect(focusSpan(28, 2000, 200)).toBe(28);
  });
});

/**
 * Крыша или этаж на холсте кампуса (запись 32).
 */
describe('screenShare', () => {
  it('доля — от меньшей стороны свободной части экрана', () => {
    // Корпус 72 м при 3 пикселях на метр — 216 px; свободно 964×812.
    expect(screenShare(72, 3, 964, 812)).toBeCloseTo(216 / 812, 9);
    expect(screenShare(72, 3, 300, 812)).toBeCloseTo(216 / 300, 9);
  });

  it('нулевое место под картой не делит на ноль', () => {
    expect(Number.isFinite(screenShare(72, 3, 0, -10))).toBe(true);
  });
});

describe('revealAmount', () => {
  it('до начала — только крыша, после конца — только этаж', () => {
    expect(revealAmount(0)).toBe(0);
    expect(revealAmount(REVEAL_START_SHARE)).toBe(0);
    expect(revealAmount(REVEAL_END_SHARE)).toBe(1);
    expect(revealAmount(5)).toBe(1);
  });

  it('между ними растёт плавно, без ступенек', () => {
    let previous = 0;
    for (let share = REVEAL_START_SHARE; share <= REVEAL_END_SHARE; share += 0.01) {
      const amount = revealAmount(share);
      expect(amount).toBeGreaterThanOrEqual(previous);
      expect(amount - previous).toBeLessThan(0.06);
      previous = amount;
    }
  });

  it('корпус открывается, когда этаж проявлен наполовину', () => {
    expect(revealAmount(REVEALED_SHARE)).toBeCloseTo(0.5, 9);
  });
});

describe('isRevealedAt', () => {
  it('закрытый открывается с порога, открытый закрывается ниже него — с запасом', () => {
    const between = (HIDDEN_SHARE + REVEALED_SHARE) / 2;

    expect(isRevealedAt(REVEALED_SHARE, false)).toBe(true);
    expect(isRevealedAt(between, false)).toBe(false);
    expect(isRevealedAt(between, true)).toBe(true);
    expect(isRevealedAt(HIDDEN_SHARE - 0.01, true)).toBe(false);
  });
});
