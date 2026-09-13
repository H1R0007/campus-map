import React from 'react';
import { useMapStore } from '../../stores/mapStore';
import { useRouteStore } from '../../stores/routeStore';
import type { RouteField } from '../../stores/routeStore';
import { messagesFor, useLanguage } from '../../i18n';
import { nodePlaceLabel } from '../../utils/placeLabels';
import { portalTypeOf } from '../../utils/portals';

interface PlaceCardProps {
  nodeId: string;

  /**
   * Открыть шторку маршрута.
   *
   * @param field поле, которое осталось заполнить; `null` — маршрут построить
   *        не удалось, и шторка нужна, чтобы показать причину
   */
  onOpenSheet: (field: RouteField | null) => void;
}

/**
 * Карточка места, выбранного на карте: что это, где, и «Отсюда» / «Сюда».
 *
 * Для точки перехода без названия — только тип и положение: сделать её концом
 * маршрута нельзя, у неё нет имени для поля.
 */
export const PlaceCard: React.FC<PlaceCardProps> = ({ nodeId, onOpenSheet }) => {
  const graph = useMapStore((s) => s.graph);
  const aliasManager = useMapStore((s) => s.aliasManager);
  const buildingMetas = useMapStore((s) => s.buildingMetas);
  const selectNode = useMapStore((s) => s.selectNode);
  const setPoint = useRouteStore((s) => s.setPoint);
  const language = useLanguage();
  const messages = messagesFor(language);

  const node = graph?.getNode(nodeId);
  if (!graph || !buildingMetas || !node) return null;

  const name = aliasManager?.getPrimaryAliasForId(nodeId, language) ?? null;
  const transition = node.isPortal ? portalTypeOf(graph, node) : null;
  const typeLabel = transition ? messages.transition[transition] : null;

  // Портал без перехода — ошибка разметки; id узла делает её видимой.
  const title = name ?? typeLabel ?? node.id;
  const details = [name !== null ? typeLabel : null, nodePlaceLabel(graph, buildingMetas, nodeId, language)]
    .filter((part) => part !== null)
    .join(' · ');

  const choose = (field: RouteField) => {
    const route = setPoint(field, nodeId);
    selectNode(null);

    if (route === null) onOpenSheet(field === 'from' ? 'to' : 'from');
    else if (!route.found) onOpenSheet(null);
  };

  return (
    <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-3">
      <div className="flex items-start gap-3 px-1">
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-gray-800 truncate">{title}</div>
          <div className="text-xs text-gray-500 truncate">{details}</div>
        </div>

        <button
          type="button"
          onClick={() => selectNode(null)}
          className="p-2 -m-1 rounded-xl text-gray-500 hover:bg-gray-100 transition-colors"
          aria-label={messages.place.close}
        >
          ✕
        </button>
      </div>

      {name !== null && (
        <div className="flex gap-2 mt-3">
          <button
            type="button"
            onClick={() => choose('from')}
            className="flex-1 h-11 rounded-xl bg-gray-100 text-gray-800 text-sm font-medium hover:bg-gray-200 transition-colors"
          >
            {messages.place.from}
          </button>
          <button
            type="button"
            onClick={() => choose('to')}
            className="flex-1 h-11 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            {messages.place.to}
          </button>
        </div>
      )}
    </div>
  );
};
