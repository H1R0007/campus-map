import React from 'react';
import { messagesFor, useLanguage } from '../../i18n';
import { useMapStore } from '../../stores/mapStore';
import { useRouteStore } from '../../stores/routeStore';
import type { RouteField } from '../../stores/routeStore';
import { useUiStore } from '../../stores/uiStore';
import { nodeName, nodePlaceLabel } from '../../utils/placeLabels';
import { portalTypeOf } from '../../utils/portals';
import { Icon } from './Icon';
import { IconButton } from './IconButton';
import { PlaceIcon } from './PlaceIcon';

interface PlaceCardProps {
  nodeId: string;
}

/**
 * Карточка места, выбранного на карте или в поиске: что это, где, «Маршрут
 * сюда» и «Отсюда».
 *
 * Если вторая точка маршрута уже известна — например, «вы здесь» из QR-кода, —
 * маршрут строится сразу. Если нет, открывается поиск второй точки: это
 * следующий шаг, и искать, где его сделать, не приходится.
 *
 * Точку перехода без названия сделать концом маршрута нельзя — у неё нет имени
 * для подписи; карточка показывает только тип и положение.
 */
export const PlaceCard: React.FC<PlaceCardProps> = ({ nodeId }) => {
  const graph = useMapStore((s) => s.graph);
  const aliasManager = useMapStore((s) => s.aliasManager);
  const buildingMetas = useMapStore((s) => s.buildingMetas);
  const selectNode = useMapStore((s) => s.selectNode);
  const setPoint = useRouteStore((s) => s.setPoint);
  const openSearch = useUiStore((s) => s.openSearch);
  const language = useLanguage();
  const messages = messagesFor(language);

  const node = graph?.getNode(nodeId);
  if (!graph || !buildingMetas || !node) return null;

  const name = nodeName(aliasManager, nodeId, language);
  const transition = node.isPortal ? portalTypeOf(graph, node) : null;
  const typeLabel = transition ? messages.transition[transition] : null;

  // Портал без перехода — ошибка разметки; id узла делает её видимой.
  const title = name ?? typeLabel ?? node.id;
  const details = [name !== null ? typeLabel : null, nodePlaceLabel(graph, buildingMetas, nodeId, language)]
    .filter((part) => part !== null)
    .join(' · ');

  const choose = (field: RouteField) => {
    selectNode(null);
    if (setPoint(field, nodeId) === null) openSearch(field === 'from' ? 'to' : 'from');
  };

  return (
    <div className="px-4 pb-4">
      <div className="flex items-start gap-3">
        {/* На очень узком экране (текст увеличен до 200 %) значок отдаёт ширину
            названию: рядом с ним «Столовая» обрезалась посреди слова. */}
        <PlaceIcon
          transition={transition}
          category={aliasManager?.getCategory(nodeId) ?? null}
          size="lg"
          className="compact:hidden"
        />
        <div className="flex-1 min-w-0 pt-0.5">
          <h2
            data-panel-focus
            tabIndex={-1}
            className="text-lg font-semibold leading-snug text-gray-900 line-clamp-2 break-words outline-none"
          >
            {title}
          </h2>
          <p className="mt-0.5 text-sm text-gray-600">{details}</p>
        </div>
        <IconButton icon="close" label={messages.place.close} onClick={() => selectNode(null)} className="-mt-1 -mr-2" />
      </div>

      {name !== null && (
        <div className="mt-4 flex gap-2 compact:flex-col">
          <button
            type="button"
            onClick={() => choose('to')}
            className="flex-1 compact:flex-none min-w-0 h-12 px-4 rounded-xl bg-primary text-white font-semibold flex items-center justify-center gap-2 hover:bg-primary-hover transition-colors"
          >
            <Icon name="route" className="flex-shrink-0 compact:hidden" />
            <span className="truncate">{messages.place.route}</span>
          </button>
          <button
            type="button"
            onClick={() => choose('from')}
            className="h-12 px-5 rounded-xl bg-gray-100 text-gray-800 font-medium hover:bg-gray-200 transition-colors"
          >
            {messages.place.from}
          </button>
        </div>
      )}
    </div>
  );
};
