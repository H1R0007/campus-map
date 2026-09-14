import type { AliasManager, SearchSuggestion } from '@campus-map/core';
import type { Language } from '../i18n/languages';

/** Подсказка поиска в том виде, в каком её показывает поле маршрута. */
export interface SuggestionOption {
  id: string;

  /** Имя места на языке интерфейса — его же получит поле после выбора. */
  name: string;

  /**
   * Имя, по которому место нашлось, если в `name` его не видно: перевод
   * («Canteen» в русском интерфейсе) или другое название («Читальный зал» у
   * «Библиотеки»). Без него непонятно, почему на запрос предложено это место.
   */
  matched: string | null;
}

/**
 * Подсказки для показа: одна строка на место, имя — на языке интерфейса.
 *
 * `AliasManager.suggest` ищет по именам на всех языках и отдаёт запись на
 * каждую совпавшую форму имени. Раньше подсказка показывала эту форму как
 * есть, и русский интерфейс предлагал «Canteen». Теперь форма имени только
 * объясняет совпадение, а показывается основное имя на языке интерфейса
 * (`getPrimaryAliasForId`). Несколько форм одного места («А-101» и «101»)
 * после этого выглядели бы одинаковыми строками, поэтому схлопываются: остаётся
 * лучшая по оценке.
 *
 * @param suggestions ранжированный список ядра, лучшие первыми
 * @param limit сколько мест вернуть
 */
export function suggestionOptions(
  suggestions: readonly SearchSuggestion[],
  aliasManager: AliasManager,
  language: Language,
  limit: number
): SuggestionOption[] {
  const options: SuggestionOption[] = [];
  const seen = new Set<string>();

  for (const suggestion of suggestions) {
    if (options.length >= limit) break;
    if (seen.has(suggestion.id)) continue;
    seen.add(suggestion.id);

    const name = aliasManager.getPrimaryAliasForId(suggestion.id, language) ?? suggestion.alias;
    // «101» в «А-101» и так видно — вторая строка повторяла бы первую.
    const visible = name.toLowerCase().includes(suggestion.alias.toLowerCase());

    options.push({ id: suggestion.id, name, matched: visible ? null : suggestion.alias });
  }

  return options;
}
