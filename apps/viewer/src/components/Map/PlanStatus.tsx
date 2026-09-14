import React from 'react';
import { usePixelMapGeometry } from '@campus-map/mapkit';
import { useOnline } from '../../hooks/useOnline';
import { useMessages } from '../../i18n';

/**
 * Состояние плана поверх карты.
 *
 * Пока план грузится, подложка скрыта, и без подписи серый холст выглядел бы
 * поломкой. Недоступный план — чаще всего этаж, который ни разу не открывали,
 * без сети — тоже называется прямо: точки и линия маршрута при этом остаются
 * на месте.
 *
 * Должен рендериться внутри `<PixelMap>`.
 */
export const PlanStatus: React.FC = () => {
  const { status } = usePixelMapGeometry();
  const messages = useMessages();
  const online = useOnline();

  if (status === 'ready') return null;

  return (
    <div className="campus-plan-status" role="status">
      {/* Без связи недоступный план — не поломка, а этаж, который не сохранён
          заранее (запись 26). */}
      {status === 'loading'
        ? messages.map.planLoading
        : online
          ? messages.map.planUnavailable
          : messages.offline.planUnavailable}
    </div>
  );
};
