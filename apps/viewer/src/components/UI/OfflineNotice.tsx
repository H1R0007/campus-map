import React from 'react';
import { useOnline } from '../../hooks/useOnline';
import { useMessages } from '../../i18n';
import { Icon } from './Icon';

/**
 * Сообщение «Нет связи» над картой (запись 26).
 *
 * В подвалах и на лестницах связь пропадает. Навигатор без неё работает — данные
 * и планы маршрута сохранены, — но без объяснения человек принял бы не
 * загрузившийся план чужого этажа за поломку. Область `role="status"` на
 * странице всегда: диктор объявляет и пропажу связи, и её возвращение.
 */
export const OfflineNotice: React.FC = () => {
  const online = useOnline();
  const messages = useMessages();

  return (
    <div role="status" aria-live="polite">
      {!online && (
        <div className="flex items-center gap-2 rounded-xl bg-inverse/90 px-3 py-2 text-sm text-on-inverse shadow-lg">
          <Icon name="offline" size={18} className="flex-shrink-0" />
          <span>{messages.offline.notice}</span>
        </div>
      )}
    </div>
  );
};
