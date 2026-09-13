import React from 'react';
import { usePixelMapGeometry } from '@campus-map/mapkit';
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

  if (status === 'ready') return null;

  return (
    <div className="campus-plan-status" role="status">
      {status === 'loading' ? messages.map.planLoading : messages.map.planUnavailable}
    </div>
  );
};
