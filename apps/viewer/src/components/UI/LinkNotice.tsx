import React from 'react';
import { useMessages } from '../../i18n';

interface LinkNoticeProps {
  /** Точки из ссылки, которых нет в данных. */
  unresolved: readonly string[];
  onDismiss: () => void;
}

/**
 * Сообщение о точке из ссылки, которой нет в данных.
 *
 * Устаревший QR-код после переразметки иначе открывал бы обычную карту без
 * объяснения, и человек решил бы, что навигатор не работает.
 */
export const LinkNotice: React.FC<LinkNoticeProps> = ({ unresolved, onDismiss }) => {
  const messages = useMessages();

  if (unresolved.length === 0) return null;

  return (
    <div
      role="alert"
      className="absolute top-[calc(4.5rem+env(safe-area-inset-top))] left-3 right-16 z-[1001] flex items-start gap-2 rounded-xl bg-gray-900/90 px-3 py-2 text-sm text-white shadow-lg"
    >
      <span className="flex-1 break-words">{messages.link.notFound(unresolved.join(', '))}</span>
      <button
        type="button"
        onClick={onDismiss}
        className="-m-1 p-1 rounded-lg text-gray-300 hover:text-white"
        aria-label={messages.link.dismiss}
      >
        ✕
      </button>
    </div>
  );
};
