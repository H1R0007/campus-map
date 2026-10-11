import React, { useRef, useState } from 'react';
import type { ShareRoute } from '../../hooks/useShareRoute';
import { messagesFor, useLanguage } from '../../i18n';
import { useMapStore } from '../../stores/mapStore';
import { useRouteStore } from '../../stores/routeStore';
import type { RouteField } from '../../stores/routeStore';
import { useUiStore } from '../../stores/uiStore';
import { routeLink } from '../../utils/deepLink';
import { pointPhotos } from '../../utils/photos';
import { nodeName, nodePlaceLabel } from '../../utils/placeLabels';
import { portalTypeOf } from '../../utils/portals';
import { Icon } from './Icon';
import { IconButton } from './IconButton';
import { PhotoThumb } from './PhotoThumb';
import { PhotoViewer } from './PhotoViewer';
import { PlaceIcon } from './PlaceIcon';

interface PlaceCardProps {
  nodeId: string;
  share: ShareRoute;
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
 *
 * «Поделиться местом» отправляет ссылку на эту карточку (`?to=`): преподаватель
 * присылает группе аудиторию, и каждый строит маршрут от себя. Прежде
 * поделиться можно было только маршрутом — с чужим началом.
 *
 * Фото места (запись 85) — миниатюрой на месте значка: карточка не становится
 * выше, и карта над ней прежняя. Нажатие открывает фото во весь экран. Не
 * загрузилось маленькое фото — нет связи, и оно не сохранено, — остаётся
 * значок, а не пустая рамка.
 */
export const PlaceCard: React.FC<PlaceCardProps> = ({ nodeId, share }) => {
  const graph = useMapStore((s) => s.graph);
  const aliasManager = useMapStore((s) => s.aliasManager);
  const buildingMetas = useMapStore((s) => s.buildingMetas);
  const selectNode = useMapStore((s) => s.selectNode);
  const setPoint = useRouteStore((s) => s.setPoint);
  const openSearch = useUiStore((s) => s.openSearch);
  const language = useLanguage();
  const messages = messagesFor(language);
  const thumbRef = useRef<HTMLButtonElement>(null);
  const compactPhotoRef = useRef<HTMLButtonElement>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [thumbFailed, setThumbFailed] = useState(false);

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

  const photos = pointPhotos(graph, nodeId);
  const showPhoto = photos.length > 0 && !thumbFailed;
  const closeViewer = () => {
    setViewerOpen(false);
    // Фокус — туда, откуда открыли: на миниатюру или, при крупном тексте, на кнопку.
    (thumbRef.current?.offsetParent ? thumbRef.current : compactPhotoRef.current)?.focus();
  };

  const choose = (field: RouteField) => {
    selectNode(null);
    if (setPoint(field, nodeId) === null) openSearch(field === 'from' ? 'to' : 'from');
  };

  return (
    <div className="px-4 pb-4">
      <div className="flex items-start gap-3">
        {/* На очень узком экране (текст увеличен до 200 %) значок отдаёт ширину
            названию: рядом с ним «Столовая» обрезалась посреди слова. */}
        {showPhoto ? (
          <PhotoThumb
            ref={thumbRef}
            photo={photos[0]}
            count={photos.length}
            label={messages.photo.open(title, photos.length)}
            onOpen={() => setViewerOpen(true)}
            onUnavailable={() => setThumbFailed(true)}
            className="w-14 h-14 compact:hidden"
          />
        ) : (
          <PlaceIcon
            transition={transition}
            category={aliasManager?.getCategory(nodeId) ?? null}
            size="lg"
            className="compact:hidden"
          />
        )}
        <div className="flex-1 min-w-0 pt-0.5">
          <h2
            data-panel-focus
            tabIndex={-1}
            className="text-lg font-semibold leading-snug text-gray-900 line-clamp-2 break-words outline-none"
          >
            {title}
          </h2>
          <p className="mt-0.5 text-sm text-gray-600">{details}</p>
          {/* При тексте 200 % миниатюре нет места — фото открывает кнопка под названием. */}
          {showPhoto && (
            <button
              ref={compactPhotoRef}
              type="button"
              onClick={() => setViewerOpen(true)}
              className="hidden compact:inline-flex mt-1 -ml-2 min-h-11 px-2 rounded-xl items-center gap-2 text-sm font-medium text-accent hover:bg-selected transition-colors"
            >
              <Icon name="photo" size={18} />
              {messages.photo.show(photos.length)}
            </button>
          )}
        </div>
        {/* На очень узком экране (текст 200 %) кнопки нет: рядом с двумя
            кнопками название места снова ломалось бы посреди слова. */}
        {name !== null && (
          <IconButton
            ref={share.buttonRef}
            icon="share"
            label={messages.place.share}
            onClick={() => share.sharePlace(routeLink(window.location.href, { from: null, to: nodeId }, language), name)}
            className="-mt-1 compact:hidden"
          />
        )}
        <IconButton icon="close" label={messages.place.close} onClick={() => selectNode(null)} className="-mt-1 -mr-2" />
      </div>

      {viewerOpen && <PhotoViewer photos={photos} title={title} subtitle={details} onClose={closeViewer} />}

      {/* В узкой колонке (текст 200 % на телефоне) подписи кнопок переносятся, а не обрезаются. */}
      {name !== null && (
        <div className="mt-4 flex gap-2 compact:flex-col">
          <button
            type="button"
            onClick={() => choose('to')}
            className="flex-1 compact:flex-none min-w-0 h-12 compact:h-auto compact:min-h-12 compact:py-2 px-4 compact:px-3 rounded-xl bg-primary text-white font-semibold flex items-center justify-center gap-2 hover:bg-primary-hover transition-colors"
          >
            <Icon name="route" className="flex-shrink-0 compact:hidden" />
            <span className="truncate compact:whitespace-normal compact:text-center">{messages.place.route}</span>
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
