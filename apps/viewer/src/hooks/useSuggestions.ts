import { useEffect, useMemo, useState } from 'react';
import type { SearchSuggestion } from '@campus-map/core';
import { useMapStore } from '../stores/mapStore';

/** Сколько подсказок показывать. Больше не помещается на экране телефона. */
const SUGGESTION_LIMIT = 5;

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

/**
 * Подсказки по введённому тексту.
 *
 * Раньше списки подсказок лежали в сторе маршрута и переписывались на каждое
 * нажатие клавиши. Это чистая функция от запроса и загруженных алиасов —
 * хранить её результат значит завести второй источник истины, который обязан
 * кем-то поддерживаться в актуальном состоянии. Здесь он вычисляется.
 */
export function useSuggestions(query: string): SearchSuggestion[] {
  const aliasManager = useMapStore((s) => s.aliasManager);
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

  return useMemo(() => {
    if (!debouncedQuery.trim() || !aliasManager) return [];
    return aliasManager.suggest(debouncedQuery, SUGGESTION_LIMIT);
  }, [debouncedQuery, aliasManager]);
}
