import { describe, expect, it } from 'vitest';
import { shouldShowOnboarding } from '../src/utils/onboarding';

/** Когда показывать знакомство при первом запуске (запись 25). */
describe('shouldShowOnboarding', () => {
  const env = (search: string, stored: string | null = null, storageAvailable = true) => ({
    search,
    stored,
    storageAvailable,
  });

  it('первое открытие без ссылки — показывать', () => {
    expect(shouldShowOnboarding(env(''))).toBe(true);
    expect(shouldShowOnboarding(env('?lang=en'))).toBe(true);
  });

  it('пройденное или пропущенное — больше не показывать', () => {
    expect(shouldShowOnboarding(env('', '1'))).toBe(false);
  });

  it('по ссылке с точками маршрута — не показывать', () => {
    expect(shouldShowOnboarding(env('?at=a1_entrance'))).toBe(false);
    expect(shouldShowOnboarding(env('?to=a3_room305&lang=en'))).toBe(false);
    expect(shouldShowOnboarding(env('?from=campus_gate&to=b1_library'))).toBe(false);
  });

  it('без хранилища — не показывать: иначе знакомство было бы при каждом открытии', () => {
    expect(shouldShowOnboarding(env('', null, false))).toBe(false);
  });
});
