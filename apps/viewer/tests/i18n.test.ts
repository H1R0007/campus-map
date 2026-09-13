import { describe, expect, it } from 'vitest';
import { formatFloor, messagesFor } from '../src/i18n';
import { LANGUAGES } from '../src/i18n/languages';
import { detectLanguage } from '../src/stores/settingsStore';
import type { LanguageEnvironment } from '../src/stores/settingsStore';

/**
 * Язык интерфейса и словари.
 */

function environment(overrides: Partial<LanguageEnvironment>): LanguageEnvironment {
  return { search: '', stored: null, preferred: [], ...overrides };
}

describe('detectLanguage', () => {
  it('ссылка важнее сохранённого выбора и языка браузера', () => {
    // QR-код на английской табличке обязан открыть английский интерфейс даже у
    // того, кто когда-то выбрал русский.
    expect(detectLanguage(environment({ search: '?lang=en', stored: 'ru', preferred: ['ru-RU'] }))).toBe('en');
  });

  it('сохранённый выбор важнее языка браузера', () => {
    expect(detectLanguage(environment({ stored: 'en', preferred: ['ru-RU'] }))).toBe('en');
  });

  it('берёт первый поддержанный язык браузера по основному подтегу', () => {
    expect(detectLanguage(environment({ preferred: ['kk-KZ', 'en-GB', 'ru'] }))).toBe('en');
  });

  it('неизвестный код в ссылке и в хранилище пропускается', () => {
    expect(detectLanguage(environment({ search: '?lang=de', stored: 'xx', preferred: ['ru'] }))).toBe('ru');
  });

  it('без подсказок — язык данных', () => {
    expect(detectLanguage(environment({}))).toBe('ru');
  });
});

/** Все строки словаря с путями ключей; функции вызываются с тестовыми аргументами. */
function collectStrings(value: unknown, path: string, into: Map<string, string>): void {
  if (typeof value === 'string') {
    into.set(path, value);
  } else if (typeof value === 'function') {
    into.set(path, String((value as (...args: unknown[]) => unknown)('1', '1')));
  } else if (typeof value === 'object' && value !== null) {
    for (const [key, nested] of Object.entries(value)) collectStrings(nested, `${path}.${key}`, into);
  }
}

describe('словари', () => {
  it('у всех языков один набор ключей и ни одной пустой строки', () => {
    // Тип требует каждый ключ, но пустую строку-заглушку пропустил бы.
    const reference = new Map<string, string>();
    collectStrings(messagesFor('ru'), 'ru', reference);
    const referenceKeys = [...reference.keys()].map((key) => key.slice('ru'.length));

    for (const language of LANGUAGES) {
      const strings = new Map<string, string>();
      collectStrings(messagesFor(language), language, strings);

      expect([...strings.keys()].map((key) => key.slice(language.length))).toEqual(referenceKeys);
      expect([...strings].filter(([, text]) => text.trim().length === 0).map(([key]) => key)).toEqual([]);
    }
  });
});

describe('formatFloor', () => {
  it('подземный этаж — с типографским минусом, надземный — как есть', () => {
    expect(formatFloor(-1)).toBe('−1');
    expect(formatFloor(3)).toBe('3');
  });
});
