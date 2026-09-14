import React, { useMemo } from 'react';
import { PLACE_CATEGORIES } from '@campus-map/core';
import { messagesFor, useLanguage } from '../../i18n';
import { useMapStore } from '../../stores/mapStore';
import { useRouteStore } from '../../stores/routeStore';
import { useUiStore } from '../../stores/uiStore';
import { nearestHint, nearestPlaceOf } from '../../utils/nearestPlace';
import { Icon } from './Icon';

/**
 * Быстрые кнопки к ближайшему месту: туалет, столовая, гардероб, выход
 * (запись 22).
 *
 * Ближайшее — от начала маршрута: «вы здесь» из QR-кода или выбранной точки.
 * Тогда кнопка сразу строит маршрут, а подсказка ещё до нажатия говорит, сколько
 * идти или где это. Если, где человек, неизвестно, кнопка спрашивает об этом
 * поиском начала: открытый на карте этаж — не то место, где человек стоит.
 *
 * Кнопок категорий, которых нет в данных, нет. Категория, до мест которой от
 * начала не дойти вовсе, недоступна.
 */
export const QuickPlaces: React.FC = () => {
  const graph = useMapStore((s) => s.graph);
  const aliasManager = useMapStore((s) => s.aliasManager);
  const buildingMetas = useMapStore((s) => s.buildingMetas);
  const fromNodeId = useRouteStore((s) => s.fromNodeId);
  const options = useRouteStore((s) => s.options);
  const routeToNearest = useRouteStore((s) => s.routeToNearest);
  const openSearch = useUiStore((s) => s.openSearch);
  const language = useLanguage();
  const messages = messagesFor(language);

  const categories = useMemo(
    () =>
      aliasManager ? PLACE_CATEGORIES.filter((category) => aliasManager.getIdsByCategory(category).length > 0) : [],
    [aliasManager]
  );

  // Поиск ближайшего — при смене начала или ограничений, а не по нажатию:
  // подсказка нужна до нажатия.
  const nearest = useMemo(() => {
    if (!graph || !aliasManager || fromNodeId === null) return null;
    return new Map(
      categories.map((category) => [category, nearestPlaceOf(graph, aliasManager, fromNodeId, category, options)])
    );
  }, [graph, aliasManager, fromNodeId, options, categories]);

  if (categories.length === 0) return null;

  return (
    <ul aria-label={messages.quick.label} className="grid grid-cols-4 gap-2">
      {categories.map((category) => {
        const place = nearest?.get(category) ?? null;
        const missing = nearest !== null && place === null;
        const hint = missing
          ? messages.quick.none
          : place !== null && graph && buildingMetas && fromNodeId !== null
            ? nearestHint(graph, buildingMetas, fromNodeId, place, language)
            : null;
        // Видимая подпись входит в имя кнопки для диктора (WCAG 2.5.3).
        const label = messages.quick.nearest[category];

        return (
          <li key={category} className="min-w-0">
            <button
              type="button"
              disabled={missing}
              onClick={() => (fromNodeId === null ? openSearch('from', category) : routeToNearest(category))}
              aria-label={hint !== null ? `${label}, ${hint}` : label}
              className="w-full min-h-[4.75rem] px-1 py-2 rounded-2xl bg-gray-50 flex flex-col items-center gap-1 text-center hover:bg-gray-100 transition-colors disabled:opacity-40 disabled:hover:bg-gray-50"
            >
              <span
                aria-hidden="true"
                className="w-9 h-9 flex-shrink-0 rounded-full bg-selected text-accent flex items-center justify-center"
              >
                <Icon name={category} size={20} />
              </span>
              <span className="max-w-full truncate text-xs font-medium text-gray-800">
                {messages.quick.category[category]}
              </span>
              {/* Две строки, а не обрезка: «Корпус Б, этаж 1» в кнопку шириной в
                  четверть телефона одной строкой не помещается. */}
              {hint !== null && (
                <span className="max-w-full line-clamp-2 text-xs leading-tight text-gray-600">{hint}</span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
};
