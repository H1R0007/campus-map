import React from 'react';
import { useMessages } from '../../i18n';
import { useRouteStore } from '../../stores/routeStore';
import { useUiStore } from '../../stores/uiStore';
import { Icon } from './Icon';

interface LinkNoticeProps {
  /** Точки из ссылки, которых нет в данных. */
  unresolved: readonly string[];
  onDismiss: () => void;
}

/**
 * Сообщение о точке из ссылки, которой нет в данных.
 *
 * Устаревший QR-код после переразметки иначе открывал бы обычную карту без
 * объяснения, и человек решил бы, что навигатор не работает. На широком экране
 * сообщение стоит над картой, справа от панели навигатора.
 *
 * Сообщение говорит, что делать дальше, и делает это одной кнопкой: поиск
 * того, чего не хватило, — второй точки, если одна из ссылки нашлась. Раньше
 * в нём был только код точки вроде `a3_room305`, и следующий шаг человек
 * искал сам. Код остаётся мелко — для того, кто чинит табличку.
 */
export const LinkNotice: React.FC<LinkNoticeProps> = ({ unresolved, onDismiss }) => {
  const messages = useMessages();
  const fromNodeId = useRouteStore((s) => s.fromNodeId);
  const toNodeId = useRouteStore((s) => s.toNodeId);
  const openSearch = useUiStore((s) => s.openSearch);

  if (unresolved.length === 0) return null;

  const search = () => {
    onDismiss();
    openSearch(fromNodeId !== null ? 'to' : toNodeId !== null ? 'from' : 'place');
  };

  return (
    <div role="alert" className="flex items-start gap-1 rounded-xl bg-inverse/90 pl-3 text-sm text-on-inverse shadow-lg">
      <div className="flex-1 min-w-0 py-2">
        <p className="font-semibold">{messages.link.notFound}</p>
        <p className="mt-0.5 text-on-inverse/80">{messages.link.outdated}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <button
            type="button"
            onClick={search}
            className="h-11 px-3 -ml-1 rounded-lg bg-on-inverse/15 font-medium flex items-center gap-1.5 hover:bg-on-inverse/25 transition-colors"
          >
            <Icon name="search" size={16} />
            {messages.link.search}
          </button>
          <span className="min-w-0 break-all text-xs text-on-inverse/60">{messages.link.code(unresolved.join(', '))}</span>
        </div>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="w-11 h-11 flex-shrink-0 rounded-xl flex items-center justify-center text-on-inverse/70 hover:text-on-inverse"
        aria-label={messages.link.dismiss}
      >
        <Icon name="close" size={18} />
      </button>
    </div>
  );
};
