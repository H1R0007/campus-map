import React from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { useHistoryStore } from '../../stores/historyStore';
import { Icon } from './Icon';

/**
 * Полоса «изменения» внизу карточки: правки копятся в одну запись истории, и
 * ими можно распорядиться разом — применить или вернуть всё как было.
 *
 * @param what чьи изменения, в родительном падеже: «точки», «этажа», «корпуса»
 */
export const SessionBar: React.FC<{ sessionKey: string; what: string }> = ({ sessionKey, what }) => {
  const pending = useHistoryStore(
    (s) => s.session !== null && s.session.key === sessionKey && s.currentIndex > s.session.startIndex
  );
  const closeSession = useEditorStore((s) => s.closeSession);
  const revertSession = useEditorStore((s) => s.revertSession);
  const showNotice = useEditorStore((s) => s.showNotice);

  if (!pending) return null;

  return (
    <div className="editor-card__session" role="group" aria-label={`Изменения ${what}`}>
      <p className="editor-section__hint">Изменения {what} — одной правкой: отмена вернёт их все разом.</p>
      <div className="editor-card__actions">
        <button
          type="button"
          className="editor-button editor-button--primary"
          onClick={() => {
            closeSession();
            showNotice(`Изменения ${what} применены`);
          }}
        >
          <Icon name="checkCircle" />
          Применить
        </button>
        <button type="button" className="editor-button editor-button--ghost" onClick={revertSession}>
          Отменить изменения
        </button>
      </div>
    </div>
  );
};
