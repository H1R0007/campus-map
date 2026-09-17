import React from 'react';
import { useChoosePlace } from '../../hooks/useChoosePlace';
import { messagesFor, useLanguage } from '../../i18n';
import { useMapStore } from '../../stores/mapStore';
import { useRouteStore } from '../../stores/routeStore';
import type { RouteField } from '../../stores/routeStore';
import { useUiStore } from '../../stores/uiStore';
import type { SearchTarget } from '../../stores/uiStore';
import { nodeName } from '../../utils/placeLabels';
import { Icon } from './Icon';
import { IconButton } from './IconButton';
import { LanguageSwitch } from './LanguageSwitch';
import { QuickPlaces } from './QuickPlaces';
import { RecentPlaces } from './RecentPlaces';
import { ThemeButton } from './ThemeButton';

interface IdleContentProps {
  /** Раскрытая панель показывает ещё быстрые кнопки, недавние места и кнопку оформления. */
  expanded: boolean;
}

/**
 * Панель, когда ни места, ни маршрута нет: кнопка поиска и уже заданная точка.
 *
 * Поиск знает, что задать. Без точек — найти место и показать его на карте.
 * С одной точкой — вторую, и маршрут построится сразу: у двери с QR-кодом
 * человек выбирает только, куда идти.
 */
export const IdleContent: React.FC<IdleContentProps> = ({ expanded }) => {
  const fromNodeId = useRouteStore((s) => s.fromNodeId);
  const toNodeId = useRouteStore((s) => s.toNodeId);
  const clearPoint = useRouteStore((s) => s.clearPoint);
  const aliasManager = useMapStore((s) => s.aliasManager);
  const openSearch = useUiStore((s) => s.openSearch);
  const choose = useChoosePlace();
  const language = useLanguage();
  const messages = messagesFor(language);

  const target: SearchTarget = fromNodeId !== null ? 'to' : toNodeId !== null ? 'from' : 'place';

  const point = (field: RouteField, nodeId: string | null) => {
    if (nodeId === null) return null;
    const name = nodeName(aliasManager, nodeId, language) ?? nodeId;

    return (
      <div className="flex items-center gap-3 rounded-xl bg-gray-50 pl-4">
        <span
          aria-hidden="true"
          className={`w-3 h-3 flex-shrink-0 rounded-full ${field === 'from' ? 'bg-start' : 'bg-primary'}`}
        />
        <span className="flex-1 min-w-0 py-2">
          <span className="block text-xs text-gray-500">{messages.search[field]}</span>
          <span className="block text-base text-gray-900 truncate">{name}</span>
        </span>
        <IconButton icon="close" label={messages.search.clearPoint(name)} onClick={() => clearPoint(field)} />
      </div>
    );
  };

  return (
    <div className="px-4 pb-4 space-y-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          data-panel-focus
          onClick={() => openSearch(target)}
          className="flex-1 min-w-0 h-12 px-4 rounded-xl bg-gray-100 flex items-center gap-3 text-left hover:bg-gray-200 transition-colors"
        >
          <Icon name="search" className="flex-shrink-0 text-gray-500" />
          <span className="flex-1 min-w-0 truncate text-base text-gray-700">{messages.search.open[target]}</span>
        </button>
        {/* Оформление — круглой кнопкой в углу раскрытой панели, а не строкой:
            тему меняют редко (записи 34 и 37). */}
        {expanded && <ThemeButton />}
      </div>

      {point('from', fromNodeId)}
      {point('to', toNodeId)}

      {/* Быстрые кнопки — пока цели нет: они её и задают. Без заданной точки
          свёрнутая шторка — только поиск, место отдано карте: кнопки — в поиске и
          в раскрытой шторке (запись 37). У двери с QR-кодом начало известно, и
          кнопки с временем до места нужны сразу. */}
      {toNodeId === null && (fromNodeId !== null || expanded) && <QuickPlaces />}

      {expanded && (
        <div className="pt-2 space-y-5">
          <RecentPlaces onChoose={(nodeId) => choose(target, nodeId)} exclude={[fromNodeId, toNodeId]} />
          {/* Корпуса здесь не повторяются: их выбирают в шапке (`BuildingMenu`). */}
          {/* На экране уже 300 px — например, при увеличении текста в 200 % —
              переключателю языка нет места в шапке, и он здесь (запись 28). */}
          <div className="hidden items-center justify-between gap-2 px-1 compact:flex">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              {messages.languageSwitch}
            </span>
            <LanguageSwitch />
          </div>
        </div>
      )}
    </div>
  );
};
