import React from 'react';
import type { ShareRoute } from '../../hooks/useShareRoute';
import { useStepNavigation } from '../../hooks/useStepNavigation';
import { capitalize, messagesFor, useLanguage } from '../../i18n';
import { useMapStore } from '../../stores/mapStore';
import { useRouteStore } from '../../stores/routeStore';
import { useUiStore } from '../../stores/uiStore';
import { nodeName } from '../../utils/placeLabels';
import { routeSummary } from '../../utils/routeSummary';
import { Icon } from './Icon';
import { IconButton } from './IconButton';
import { RouteOptions } from './RouteOptions';
import { RouteSteps } from './RouteSteps';

interface RouteOverviewProps {
  /** Показать точки, ограничения и шаги. На широком экране — всегда. */
  expanded: boolean;
  onExpand: () => void;
  share: ShareRoute;
}

const SECONDARY_BUTTON =
  'h-12 px-5 rounded-xl bg-gray-100 text-gray-800 font-medium flex items-center justify-center gap-2 hover:bg-gray-200 transition-colors';

/**
 * Обзор маршрута.
 *
 * Свёрнутым — главное целиком: куда, откуда и сколько идти. Раньше свёрнутая карточка
 * обрезала и сводку, и цель («Маршрут готов…», «Главный вход корп…»), а шаги
 * открывались модальной шторкой поверх карты. Раскрытым — точки маршрута
 * (кнопки, открывающие поиск), ограничения и шаги; карта над шторкой видна.
 *
 * «Начать» и нажатие на шаг открывают пошаговую навигацию (`RouteNavigation`).
 *
 * Если маршрут не найден, свёрнутый обзор называет причину, а когда мешает
 * запрет лестниц, снимает его одной кнопкой.
 */
export const RouteOverview: React.FC<RouteOverviewProps> = ({ expanded, onExpand, share }) => {
  const graph = useMapStore((s) => s.graph);
  const aliasManager = useMapStore((s) => s.aliasManager);
  const currentRoute = useRouteStore((s) => s.currentRoute);
  const fromNodeId = useRouteStore((s) => s.fromNodeId);
  const toNodeId = useRouteStore((s) => s.toNodeId);
  const options = useRouteStore((s) => s.options);
  const setOptions = useRouteStore((s) => s.setOptions);
  const clearRoute = useRouteStore((s) => s.clearRoute);
  const swapPoints = useRouteStore((s) => s.swapPoints);
  const openSearch = useUiStore((s) => s.openSearch);
  const navigation = useStepNavigation();
  const language = useLanguage();
  const messages = messagesFor(language);

  if (!graph || currentRoute === null) return null;

  const nameOf = (nodeId: string | null) => (nodeId === null ? '' : (nodeName(aliasManager, nodeId, language) ?? nodeId));

  // Запрет лестниц — единственное ограничение в интерфейсе, из-за которого
  // точки перестают быть связаны: снять его — одна кнопка.
  const stairsBlock = currentRoute.reason === 'unreachable' && options.allowStairs === false;

  return (
    <div className="px-4 pb-4">
      {currentRoute.found ? (
        <div className="flex items-start gap-1">
          {/* Цель — заголовком, сводка — строкой над ней. В пиксельном режиме
              сводка — число корпусов и этажей («1 этаж»), и заголовком она
              ничего не говорила; время и длина в метрическом режиме тоже
              читаются лучше рядом с целью, чем вместо неё. */}
          <div className="flex-1 min-w-0 pt-0.5">
            <p className="text-sm text-gray-600">{messages.route.summaryLine(routeSummary(graph, currentRoute, language))}</p>
            <h2 data-panel-focus tabIndex={-1} className="text-xl font-semibold leading-snug text-gray-900 line-clamp-2 outline-none">
              {nameOf(toNodeId)}
            </h2>
            {/* В раскрытом обзоре начало видно в точках маршрута ниже. */}
            {!expanded && (
              <p className="mt-0.5 text-sm text-gray-600 truncate">{messages.route.fromPlace(nameOf(fromNodeId))}</p>
            )}
          </div>
          <IconButton ref={share.buttonRef} icon="share" label={messages.route.share} onClick={share.share} />
          <IconButton icon="close" label={messages.route.resetRoute} onClick={clearRoute} className="-mr-2" />
        </div>
      ) : (
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="w-11 h-11 flex-shrink-0 rounded-full bg-danger-soft text-danger flex items-center justify-center"
          >
            <Icon name="alert" />
          </span>
          <div className="flex-1 min-w-0 pt-0.5">
            <h2 data-panel-focus tabIndex={-1} className="text-lg font-semibold text-gray-900 outline-none">
              {messages.route.notFoundTitle}
            </h2>
            {/* Причина — по коду ядра. Объявление для экранного диктора делает `RouteAnnouncer`. */}
            <p className="mt-0.5 text-sm text-gray-600">
              {capitalize(messages.route.failure[currentRoute.reason ?? 'unreachable'], language)}
            </p>
          </div>
          <IconButton icon="close" label={messages.route.resetRoute} onClick={clearRoute} className="-mt-1 -mr-2" />
        </div>
      )}

      {(currentRoute.found || stairsBlock || !expanded) && (
        <div className="mt-3 flex gap-2 compact:flex-col">
          {currentRoute.found && (
            <button
              type="button"
              onClick={() => navigation.goTo(0)}
              className="flex-1 min-w-0 h-12 px-4 rounded-xl bg-primary text-white font-semibold flex items-center justify-center gap-2 hover:bg-primary-hover transition-colors"
            >
              <Icon name="start" size={16} filled />
              {messages.route.start}
            </button>
          )}
          {stairsBlock && (
            <button
              type="button"
              onClick={() => setOptions({ allowStairs: true })}
              className="flex-1 h-12 px-4 rounded-xl bg-primary text-white font-semibold hover:bg-primary-hover transition-colors"
            >
              {messages.route.allowStairs}
            </button>
          )}
          {!expanded && (
            <button
              type="button"
              onClick={onExpand}
              className={`${SECONDARY_BUTTON} ${currentRoute.found || stairsBlock ? '' : 'flex-1'}`}
            >
              {currentRoute.found && <Icon name="expand" />}
              {currentRoute.found ? messages.route.showSteps : messages.route.edit}
            </button>
          )}
        </div>
      )}

      {expanded && (
        <div className="mt-4 space-y-5">
          <div className="flex items-center gap-1">
            <div className="flex-1 min-w-0 rounded-2xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
              {(['from', 'to'] as const).map((field) => (
                <button
                  key={field}
                  type="button"
                  onClick={() => openSearch(field)}
                  className="w-full min-h-[3.5rem] px-4 py-2 flex items-center gap-3 text-left hover:bg-gray-50 transition-colors"
                >
                  <span
                    aria-hidden="true"
                    className={`w-3 h-3 flex-shrink-0 rounded-full ${field === 'from' ? 'bg-start' : 'bg-primary'}`}
                  />
                  <span className="flex-1 min-w-0">
                    <span className="block text-xs text-gray-500">{messages.search[field]}</span>
                    <span className="block text-base text-gray-900 truncate">
                      {nameOf(field === 'from' ? fromNodeId : toNodeId)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
            <IconButton icon="swap" label={messages.search.swap} onClick={swapPoints} />
          </div>

          <RouteOptions />
          <RouteSteps steps={navigation.steps} currentIndex={null} onSelect={navigation.goTo} />
        </div>
      )}
    </div>
  );
};
