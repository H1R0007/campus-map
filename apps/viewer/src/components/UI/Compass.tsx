import React from 'react';
import { useMap } from 'react-leaflet';
import { rotateTo } from '@campus-map/mapkit';
import { useMessages } from '../../i18n';

/**
 * Компас — пока карта повёрнута (запись 36). Стрелка показывает, где север;
 * нажатие плавно возвращает карту на север. Без поворота компаса нет, и места
 * в колонке он не занимает.
 *
 * Должен рендериться внутри карты: поворачивает её экземпляр.
 */
export const Compass: React.FC<{ bearing: number }> = ({ bearing }) => {
  const map = useMap();
  const messages = useMessages();

  return (
    <button
      type="button"
      onClick={() => rotateTo(map, 0)}
      aria-label={messages.map.north}
      title={messages.map.north}
      className="campus-zoom-controls__button campus-compass"
    >
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" style={{ transform: `rotate(${bearing}deg)` }}>
        <path d="M12 2.5l4.5 9.5h-9z" className="fill-danger" />
        <path d="M12 21.5l-4.5-9.5h9z" className="fill-gray-400" />
      </svg>
    </button>
  );
};
