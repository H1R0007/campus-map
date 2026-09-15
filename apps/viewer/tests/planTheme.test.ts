import { describe, expect, it } from 'vitest';
import { planStyleFor } from '../src/theme/planTheme';

/**
 * Стиль, вписываемый в SVG-планы (запись 35).
 */
describe('planStyleFor', () => {
  it('светлая тема — без стиля: цвета из файла', () => {
    expect(planStyleFor('light')).toBe('');
  });

  it('тёмная тема перекрашивает лист и стены', () => {
    const css = planStyleFor('dark');
    expect(css).toContain('.plan-floor, .plan-room--service{fill:rgb(30 34 42)}');
    expect(css).toContain('.plan-ground{fill:rgb(22 30 26)}');
  });

  it('на плане территории холста крыши спрятаны в обеих темах', () => {
    expect(planStyleFor('light', true)).toBe('.plan-roof,.plan-roof-label{display:none}');
    expect(planStyleFor('dark', true)).toMatch(/\.plan-roof,\.plan-roof-label\{display:none\}$/);
  });
});
