import React from 'react';
import { useMap } from 'react-leaflet';
import { fitPaddingOf, useMapFrame } from '@campus-map/mapkit';
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
export const ZoomControls: React.FC = () => {
  const map = useMap();
  const { bounds } = useMapFrame();
  const insets = useMapInsets();
  const messages = useMessages();

  return (
    <div className="campus-zoom-controls">
      <button
        type="button"
        onClick={() => map.zoomIn()}
        className="campus-zoom-controls__button"
        aria-label={messages.map.zoomIn}
      >
        <Icon name="plus" />
      </button>

      <button
        type="button"
        onClick={() => map.zoomOut()}
        className="campus-zoom-controls__button"
        aria-label={messages.map.zoomOut}
      >
        <Icon name="minus" />
      </button>

      <button
        type="button"
        onClick={() => map.fitBounds(bounds, fitPaddingOf(insets))}
        className="campus-zoom-controls__button campus-zoom-controls__button--reset"
        aria-label={messages.map.fitPlan}
      >
        <Icon name="fit" />
      </button>
    </div>
  );
};
