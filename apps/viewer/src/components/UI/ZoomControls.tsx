import React from 'react';
import { useMap } from 'react-leaflet';
import { fitPaddingOf, usePixelMapGeometry } from '@campus-map/mapkit';
import { useMessages } from '../../i18n';
import { MAP_CHROME_INSETS } from '../Map/mapChrome';

/**
 * Кнопки масштаба.
 *
 * Штатный зум Leaflet отключён на карте, потому что его оформление
 * выбивается из мобильного интерфейса; этот компонент заменяет его.
 *
 * Должен рендериться внутри `<PixelMap>` (в колонке `MapRail`): использует и
 * контекст карты, и геометрию подложки. «Показать план целиком» подгоняет вид
 * под границы текущего плана с отступами под интерфейс — так же, как при
 * открытии плана.
 */
export const ZoomControls: React.FC = () => {
  const map = useMap();
  const { bounds } = usePixelMapGeometry();
  const messages = useMessages();

  const resetView = () => {
    map.fitBounds(bounds, fitPaddingOf(MAP_CHROME_INSETS));
  };

  return (
    <div className="campus-zoom-controls">
      <button
        type="button"
        onClick={() => map.zoomIn()}
        className="campus-zoom-controls__button"
        aria-label={messages.map.zoomIn}
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </button>

      <button
        type="button"
        onClick={() => map.zoomOut()}
        className="campus-zoom-controls__button"
        aria-label={messages.map.zoomOut}
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
        </svg>
      </button>

      <button
        type="button"
        onClick={resetView}
        className="campus-zoom-controls__button campus-zoom-controls__button--reset"
        aria-label={messages.map.fitPlan}
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
          />
        </svg>
      </button>
    </div>
  );
};
