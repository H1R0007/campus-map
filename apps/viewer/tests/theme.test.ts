import { describe, expect, it } from 'vitest';
import { THEME_PREFERENCES, isThemePreference, resolveColorScheme } from '../src/theme/theme';

/**
 * Тема оформления: выбор человека важнее темы системы (запись 34).
 */
describe('resolveColorScheme', () => {
  it('«как в системе» следует системе', () => {
    expect(resolveColorScheme('system', true)).toBe('dark');
    expect(resolveColorScheme('system', false)).toBe('light');
  });

  it('явный выбор важнее системы', () => {
    expect(resolveColorScheme('dark', false)).toBe('dark');
    expect(resolveColorScheme('light', true)).toBe('light');
  });
});

describe('isThemePreference', () => {
  it('принимает только известные значения — испорченное хранилище не ломает тему', () => {
    for (const preference of THEME_PREFERENCES) expect(isThemePreference(preference)).toBe(true);
    expect(isThemePreference('auto')).toBe(false);
    expect(isThemePreference(null)).toBe(false);
  });
});
