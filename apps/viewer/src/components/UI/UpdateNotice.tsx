import React from 'react';
import { useMessages } from '../../i18n';
import { useRouteStore } from '../../stores/routeStore';
import { useUpdateStore } from '../../stores/updateStore';
import { Icon } from './Icon';

/**
 * «Карта обновилась» — предложение перезагрузиться на новую версию (запись 27).
 *
 * Человек сам решает когда: «Обновить» или «Обновить позже». На шаге
 * пошаговой навигации предложения нет: перезагрузка посреди маршрута сбросила
 * бы шаг, а отвлекать идущего человека незачем. После навигации оно
 * появляется.
 */
export const UpdateNotice: React.FC = () => {
  const waiting = useUpdateStore((s) => s.waiting);
  const dismissed = useUpdateStore((s) => s.dismissed);
  const apply = useUpdateStore((s) => s.apply);
  const dismiss = useUpdateStore((s) => s.dismiss);
  const navigating = useRouteStore((s) => s.stepIndex !== null && s.currentRoute?.found === true);
  const messages = useMessages();

  const visible = waiting !== null && !dismissed && !navigating;

  return (
    <div role="status" aria-live="polite">
      {visible && (
        <div className="flex items-center gap-1 rounded-xl bg-inverse/90 pl-3 text-sm text-on-inverse shadow-lg">
          <Icon name="refresh" size={18} className="flex-shrink-0" />
          <span className="flex-1 min-w-0 py-2 pl-1">{messages.update.ready}</span>
          <button
            type="button"
            onClick={apply}
            className="h-11 px-3 flex-shrink-0 rounded-lg font-semibold text-on-inverse underline underline-offset-2"
          >
            {messages.update.apply}
          </button>
          <button
            type="button"
            onClick={dismiss}
            aria-label={messages.update.later}
            title={messages.update.later}
            className="w-11 h-11 flex-shrink-0 rounded-xl flex items-center justify-center text-on-inverse/70 hover:text-on-inverse"
          >
            <Icon name="close" size={18} />
          </button>
        </div>
      )}
    </div>
  );
};
