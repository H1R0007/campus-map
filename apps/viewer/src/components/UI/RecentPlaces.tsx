import React, { useId } from 'react';
import { messagesFor, useLanguage } from '../../i18n';
import { useMapStore } from '../../stores/mapStore';
import { useRecentStore } from '../../stores/recentStore';
import { nodeName, nodePlaceLabel } from '../../utils/placeLabels';
import { portalTypeOf } from '../../utils/portals';
import { Icon } from './Icon';
import { PlaceIcon } from './PlaceIcon';

interface RecentPlacesProps {
  onChoose: (nodeId: string) => void;
  /** Места, которые показывать не нужно, — например, уже заданные точки маршрута. */
  exclude?: readonly (string | null)[];
}

/**
 * Недавние места — первое в пустом поиске: чаще всего человек ищет то же, что
 * вчера, — свою аудиторию, столовую, деканат — и набирать это заново незачем.
 *
 * Места, которых больше нет в данных или у которых пропало название, не
 * показываются: выбрать их из интерфейса всё равно нельзя.
 */
export const RecentPlaces: React.FC<RecentPlacesProps> = ({ onChoose, exclude = [] }) => {
  const recent = useRecentStore((s) => s.recent);
  const clear = useRecentStore((s) => s.clear);
  const graph = useMapStore((s) => s.graph);
  const aliasManager = useMapStore((s) => s.aliasManager);
  const buildingMetas = useMapStore((s) => s.buildingMetas);
  const language = useLanguage();
  const messages = messagesFor(language);
  // Список бывает на экране дважды — в панели и в поиске на её месте.
  const titleId = useId();

  if (!graph || !buildingMetas) return null;

  const places = recent.flatMap((nodeId) => {
    const node = graph.getNode(nodeId);
    const name = nodeName(aliasManager, nodeId, language);
    if (!node || name === null || exclude.includes(nodeId)) return [];
    return [{ nodeId, name, transition: node.isPortal ? portalTypeOf(graph, node) : null }];
  });

  if (places.length === 0) return null;

  return (
    <section aria-labelledby={titleId}>
      <div className="px-1 flex items-center justify-between gap-2">
        <h3
          id={titleId}
          className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500"
        >
          <Icon name="recent" size={14} />
          {messages.search.recent}
        </h3>
        <button
          type="button"
          onClick={clear}
          aria-label={messages.search.clearRecentLabel}
          className="h-11 -mr-2 px-2 rounded-lg text-sm text-gray-500 hover:text-gray-800 transition-colors"
        >
          {messages.search.clearRecent}
        </button>
      </div>

      <ul className="space-y-0.5">
        {places.map((place) => (
          <li key={place.nodeId}>
            <button
              type="button"
              onClick={() => onChoose(place.nodeId)}
              className="w-full min-h-[3.5rem] px-3 py-2 rounded-xl flex items-center gap-3 text-left hover:bg-gray-50 transition-colors"
            >
              <PlaceIcon transition={place.transition} category={aliasManager?.getCategory(place.nodeId) ?? null} />
              <span className="flex-1 min-w-0">
                <span className="block text-base text-gray-900 truncate">{place.name}</span>
                <span className="block text-sm text-gray-500 truncate">
                  {nodePlaceLabel(graph, buildingMetas, place.nodeId, language)}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
};
