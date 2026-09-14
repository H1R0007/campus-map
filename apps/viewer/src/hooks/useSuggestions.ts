import { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '../i18n';
import { useMapStore } from '../stores/mapStore';
import { suggestionOptions } from '../utils/suggestions';
import type { SuggestionOption } from '../utils/suggestions';

/**
 * Задержка перед поиском, мс.
 *
 * `AliasManager.suggest` — линейный проход по всем формам названий с
 * расстоянием Левенштейна для коротких запросов. На нынешних 64 формах это
 * незаметно, на тысячах помещений — работа на каждое нажатие клавиши в
 * основном потоке. Задержка меньше времени между нажатиями при обычном наборе,
 * поэтому на ощущении отзывчивости не сказывается.
 */
const DEBOUNCE_MS = 120;

export interface Suggestions {
  options: SuggestionOption[];
  /**
   * Подсказки посчитаны для текущего запроса, а не для предыдущего. Пока
   * задержка не истекла, «ничего не найдено» показывать рано.
   */
  settled: boolean;
}

/**
 * Подсказки по введённому тексту — по одной на место, с именем на языке
 * интерфейса (`suggestionOptions`).
 *
 * Раньше списки подсказок лежали в сторе маршрута и переписывались на каждое
 * нажатие клавиши. Это чистая функция от запроса, загруженных алиасов и языка —
 * хранить её результат значит завести второй источник истины, который обязан
 * кем-то поддерживаться в актуальном состоянии. Здесь он вычисляется.
 *
 * @param limit сколько мест вернуть
 */
export function useSuggestions(query: string, limit: number): Suggestions {
  const aliasManager = useMapStore((s) => s.aliasManager);
  const language = useLanguage();
  const [debouncedQuery, setDebouncedQuery] = useState(query);

  useEffect(() => {
    // Пустой запрос гасим сразу: ждать, чтобы убрать список, незачем.
    if (!query.trim()) {
      setDebouncedQuery(query);
      return;
    }

    const timer = setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const options = useMemo(() => {
    if (!debouncedQuery.trim() || !aliasManager) return [];

    // Весь ранжированный список, а не первые формы имени: формы одного места
    // схлопываются, и короткого среза могло не хватить на `limit` мест.
    // Дороже это не стоит — `suggest` ранжирует и кэширует список целиком.
    const ranked = aliasManager.suggest(debouncedQuery, Number.POSITIVE_INFINITY);
    return suggestionOptions(ranked, aliasManager, language, limit);
  }, [debouncedQuery, aliasManager, language, limit]);

  return { options, settled: debouncedQuery === query };
}
