import React, { useMemo } from 'react';
import { messagesFor, useLanguage } from '../../i18n';
import { useMapStore } from '../../stores/mapStore';
import { useRouteStore } from '../../stores/routeStore';
import { nearestPlaceOf } from '../../utils/nearestPlace';
import { nodeName, nodePlaceLabel } from '../../utils/placeLabels';
import { Icon } from './Icon';
import { IconButton } from './IconButton';

/**
 * Прибытие: «Вы на месте» после последнего шага навигации (запись 24).
 *
 * Дальше человеку обычно нужно одно из двух: вернуться, откуда пришёл, — к
 * гардеробу, ко входу с QR-кодом, — или выйти из здания. Раньше «Готово»
 * возвращало к обзору того же маршрута, и обратный путь приходилось собирать
 * заново через поиск.
 *
 * «Обратно» меняет точки местами: маршрут строится в обратную сторону и
 * показывается обзором. «К выходу» ведёт от цели к ближайшему выходу; кнопки
 * нет, если цель сама выход или до выхода не дойти.
 */
export const ArrivalCard: React.FC = () => {
  const graph = useMapStore((s) => s.graph);
  const aliasManager = useMapStore((s) => s.aliasManager);
  const buildingMetas = useMapStore((s) => s.buildingMetas);
  const toNodeId = useRouteStore((s) => s.toNodeId);
  const options = useRouteStore((s) => s.options);
  const swapPoints = useRouteStore((s) => s.swapPoints);
  const continueToNearest = useRouteStore((s) => s.continueToNearest);
  const clearRoute = useRouteStore((s) => s.clearRoute);
  const language = useLanguage();
  const messages = messagesFor(language);

  const exitReachable = useMemo(() => {
    if (!graph || !aliasManager || toNodeId === null || aliasManager.getCategory(toNodeId) === 'exit') return false;
    return nearestPlaceOf(graph, aliasManager, toNodeId, 'exit', options) !== null;
  }, [graph, aliasManager, toNodeId, options]);

  if (!graph || !buildingMetas || toNodeId === null) return null;

  const name = nodeName(aliasManager, toNodeId, language) ?? toNodeId;

  return (
    <div className="px-4 pb-4">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="w-11 h-11 flex-shrink-0 rounded-full bg-primary text-white flex items-center justify-center"
        >
          <Icon name="check" size={22} />
        </span>
        <div className="flex-1 min-w-0 pt-0.5">
          {/* «Вы на месте» — частью заголовка: фокус приходит на него, и диктор
              читает и прибытие, и место. */}
          <h2 data-panel-focus tabIndex={-1} className="outline-none">
            <span className="block text-sm font-normal text-gray-600">{messages.arrival.title}</span>
            <span className="block text-xl font-semibold leading-snug text-gray-900 line-clamp-2">{name}</span>
          </h2>
          <p className="mt-0.5 text-sm text-gray-600">{nodePlaceLabel(graph, buildingMetas, toNodeId, language)}</p>
        </div>
        <IconButton icon="close" label={messages.route.resetRoute} onClick={clearRoute} className="-mt-1 -mr-2" />
      </div>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={swapPoints}
          className="flex-1 min-w-0 h-12 px-4 rounded-xl bg-primary text-white font-semibold flex items-center justify-center gap-2 hover:bg-primary-hover transition-colors"
        >
          <Icon name="swap" className="flex-shrink-0" />
          <span className="truncate">{messages.arrival.back}</span>
        </button>
        {exitReachable && (
          <button
            type="button"
            onClick={() => continueToNearest('exit')}
            className="flex-1 min-w-0 h-12 px-4 rounded-xl bg-gray-100 text-gray-800 font-medium flex items-center justify-center gap-2 hover:bg-gray-200 transition-colors"
          >
            <Icon name="exit" className="flex-shrink-0" />
            <span className="truncate">{messages.arrival.toExit}</span>
          </button>
        )}
      </div>
    </div>
  );
};
