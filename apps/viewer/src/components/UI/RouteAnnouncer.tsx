import React from 'react';
import { messagesFor, useLanguage } from '../../i18n';
import { useMapStore } from '../../stores/mapStore';
import { useRouteStore } from '../../stores/routeStore';
import { routeSummary } from '../../utils/routeSummary';

/**
 * Объявление результата маршрута для экранного диктора.
 *
 * Маршрут часто строится без явного нажатия «Построить» — выбором второй
 * точки, ссылкой, сменой ограничения, — и зрячий видит линию и карточку, а
 * незрячий не узнавал ничего. Область `aria-live` невидима и живёт в корне
 * приложения, а не в шторке: у шторки три разные ветки разметки, и при их
 * смене объявление терялось бы.
 */
export const RouteAnnouncer: React.FC = () => {
  const currentRoute = useRouteStore((s) => s.currentRoute);
  const graph = useMapStore((s) => s.graph);
  const language = useLanguage();
  const messages = messagesFor(language);

  let announcement = '';
  if (currentRoute !== null && graph !== null) {
    announcement = currentRoute.found
      ? messages.route.announceReady(routeSummary(graph, currentRoute, language))
      : messages.route.notFound(messages.route.failure[currentRoute.reason ?? 'unreachable']);
  }

  return (
    <div className="sr-only" aria-live="polite" aria-atomic="true">
      {announcement}
    </div>
  );
};
