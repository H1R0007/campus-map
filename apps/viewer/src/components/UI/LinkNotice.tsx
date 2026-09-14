import React from 'react';
import { useMessages } from '../../i18n';
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
 */
export const LinkNotice: React.FC<LinkNoticeProps> = ({ unresolved, onDismiss }) => {
  const messages = useMessages();

  if (unresolved.length === 0) return null;

  return (
    <div
      role="alert"
      className="absolute top-[calc(4.5rem+env(safe-area-inset-top))] left-3 right-16 lg:left-[26rem] z-[1001] flex items-center gap-1 rounded-xl bg-gray-900/90 pl-3 text-sm text-white shadow-lg"
    >
      <span className="flex-1 break-words py-2">{messages.link.notFound(unresolved.join(', '))}</span>
      <button
        type="button"
        onClick={onDismiss}
        className="w-11 h-11 flex-shrink-0 rounded-xl flex items-center justify-center text-gray-300 hover:text-white"
        aria-label={messages.link.dismiss}
      >
        <Icon name="close" size={18} />
      </button>
    </div>
  );
};
