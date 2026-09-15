import React from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { fitPaddingOf, flyToBounds, targetZoomOf, useMapFrame, zoomSmoothly } from '@campus-map/mapkit';
import { useMessages } from '../../i18n';
import { useMapInsets } from '../Map/mapChrome';
import { Icon } from './Icon';

/**
 * Кнопки масштаба.
 *
 * Штатный зум Leaflet отключён на карте, потому что его оформление
 * выбивается из мобильного интерфейса; этот компонент заменяет его.
 *
 * Должен рендериться внутри карты mapkit (в колонке `MapRail`): использует и
 * контекст карты, и её границы. «Показать план целиком» подгоняет вид под
 * границы плана или всей территории с отступами под интерфейс — так же, как при
 * открытии карты, с учётом текущей высоты шторки.
 */
export const ZoomControls: React.FC<{ withFit?: boolean }> = ({ withFit = true }) => {
  const map = useMap();
  const { bounds } = useMapFrame();
  const insets = useMapInsets();
  const messages = useMessages();

  // Масштаб — плавно и вокруг центра свободной части карты, а не всего окна:
  // половину экрана может занимать шторка (запись 33).
  const zoomBy = (delta: number) => {
    const size = map.getSize();
    const anchor = L.point((insets.left + size.x - insets.right) / 2, (insets.top + size.y - insets.bottom) / 2);
    zoomSmoothly(map, targetZoomOf(map) + delta, anchor);
  };

  return (
    <div className="campus-zoom-controls">
      <button
        type="button"
        onClick={() => zoomBy(1)}
        className="campus-zoom-controls__button"
        aria-label={messages.map.zoomIn}
      >
        <Icon name="plus" />
      </button>

      <button
        type="button"
        onClick={() => zoomBy(-1)}
        className="campus-zoom-controls__button"
        aria-label={messages.map.zoomOut}
      >
        <Icon name="minus" />
      </button>

      {withFit && (
        <button
          type="button"
          onClick={() => flyToBounds(map, bounds, fitPaddingOf(insets))}
          className="campus-zoom-controls__button campus-zoom-controls__button--reset"
          aria-label={messages.map.fitPlan}
        >
          <Icon name="fit" />
        </button>
      )}
    </div>
  );
};
