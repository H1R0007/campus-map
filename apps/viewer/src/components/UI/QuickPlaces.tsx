import React, { useMemo } from 'react';
import { CAMPUS_BUILDING_ID, searchablePlaceKinds } from '@campus-map/core';
import { messagesFor, useLanguage } from '../../i18n';
import { useMapStore } from '../../stores/mapStore';
import { useRouteStore } from '../../stores/routeStore';
import { useUiStore } from '../../stores/uiStore';
import { nearestHint, nearestPlaceOf } from '../../utils/nearestPlace';
import { EXIT_TARGET, exitNodesOf, placeKindName } from '../../utils/placeKinds';
import { Icon } from './Icon';
import { KindIcon } from './KindIcon';

/** Кнопка «Рядом»: вид места из каталога или выход. */
interface QuickTarget {
  id: string;
  label: string;
  /** Имя кнопки для диктора; видимая подпись входит в него (WCAG 2.5.3). */
  spoken: string;
  icon: React.ReactNode;
}

interface QuickPlacesProps {
  /** Вызывается перед построением маршрута — например, чтобы закрыть поиск. */
  onRoute?: () => void;
}

/**
 * Быстрые кнопки к ближайшему месту: туалет, столовая, гардероб, выход
 * (запись 22).
 *
 * Ближайшее — от начала маршрута: «вы здесь» из QR-кода или выбранной точки.
 * Тогда кнопка сразу строит маршрут, а подсказка ещё до нажатия говорит, сколько
 * идти или где это. Если, где человек, неизвестно, кнопка спрашивает об этом
 * поиском начала: открытый на карте этаж — не то место, где человек стоит.
 *
 * Кнопки — виды мест каталога с быстрой кнопкой (запись 44), в порядке
 * каталога, и выход — двери корпусов. Кнопок видов, мест которых нет в данных,
 * нет. Вид, до мест которого от начала не дойти вовсе, недоступен. С
 * территории выходить некуда — выхода там нет.
 */
export const QuickPlaces: React.FC<QuickPlacesProps> = ({ onRoute }) => {
  const graph = useMapStore((s) => s.graph);
  const aliasManager = useMapStore((s) => s.aliasManager);
  const buildingMetas = useMapStore((s) => s.buildingMetas);
  const placeKinds = useMapStore((s) => s.placeKinds);
  const fromNodeId = useRouteStore((s) => s.fromNodeId);
  const options = useRouteStore((s) => s.options);
  const routeToNearest = useRouteStore((s) => s.routeToNearest);
  const openSearch = useUiStore((s) => s.openSearch);
  const language = useLanguage();
  const messages = messagesFor(language);

  const targets = useMemo<QuickTarget[]>(() => {
    if (!aliasManager || !graph) return [];
    const kinds = searchablePlaceKinds(placeKinds)
      .filter((kind) => kind.quick === true && aliasManager.getIdsByCategory(kind.id).length > 0)
      .map((kind) => {
        const label = placeKindName(kind, language);
        return {
          id: kind.id,
          label,
          spoken: messages.quick.nearestOf(label),
          icon: kind.iconImage ? <KindIcon image={kind.iconImage} size={20} /> : <Icon name="pin" size={20} />,
        };
      });

    const start = fromNodeId === null ? undefined : graph.getNode(fromNodeId);
    const outside = start?.building === CAMPUS_BUILDING_ID;
    const exit =
      exitNodesOf(graph).length > 0 && !outside
        ? [{ id: EXIT_TARGET, label: messages.quick.exit, spoken: messages.quick.nearestExit, icon: <Icon name="exit" size={20} /> }]
        : [];
    return [...kinds, ...exit];
  }, [aliasManager, graph, placeKinds, language, messages, fromNodeId]);
  const categories = useMemo(() => targets.map((target) => target.id), [targets]);

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
    // Уже 300 px — например, при увеличении текста в 200 % — в два ряда: в
    // четверть такого экрана подпись не помещается (запись 28).
    <ul aria-label={messages.quick.label} className="grid grid-cols-4 gap-2 compact:grid-cols-2">
      {targets.map((target) => {
        const category = target.id;
        const place = nearest?.get(category) ?? null;
        const missing = nearest !== null && place === null;
        const hint = missing
          ? messages.quick.none
          : place !== null && graph && buildingMetas && fromNodeId !== null
            ? nearestHint(graph, buildingMetas, fromNodeId, place, language)
            : null;
        const label = target.spoken;

        return (
          <li key={category} className="min-w-0">
            <button
              type="button"
              disabled={missing}
              onClick={() => {
                if (fromNodeId === null) {
                  openSearch('from', category);
                  return;
                }
                onRoute?.();
                routeToNearest(category);
              }}
              aria-label={hint !== null ? `${label}, ${hint}` : label}
              className="w-full min-h-[4.75rem] px-1 py-2 rounded-2xl bg-gray-50 flex flex-col items-center gap-1 text-center hover:bg-gray-100 transition-colors disabled:opacity-40 disabled:hover:bg-gray-50"
            >
              <span
                aria-hidden="true"
                className="w-9 h-9 flex-shrink-0 rounded-full bg-selected text-accent flex items-center justify-center"
              >
                {target.icon}
              </span>
              <span className="max-w-full truncate text-xs font-medium text-gray-800">
                {target.label}
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
