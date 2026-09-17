import React, { useEffect } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { Icon } from './Icon';

/** Сколько сообщение висит само по себе, миллисекунды. */
const HIDE_AFTER_MS = 6000;

/**
 * Короткое сообщение над картой: что сделано или почему не получилось.
 *
 * Действие, которое редактор отказался выполнить, обязано объяснить причину:
 * молчаливый отказ выглядит как поломка. Сообщение читается диктором
 * (`aria-live`), гаснет само и закрывается щелчком.
 */
export const Notice: React.FC = () => {
  const notice = useEditorStore((s) => s.notice);
  const hideNotice = useEditorStore((s) => s.hideNotice);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(hideNotice, HIDE_AFTER_MS);
    return () => window.clearTimeout(timer);
    // `notice.id` меняется с каждым сообщением: одинаковые подряд не сливаются.
  }, [notice?.id, notice, hideNotice]);

  if (!notice) return null;

  return (
    <div className="editor-notice-layer">
      <div className={`editor-notice${notice.kind === 'warn' ? ' editor-notice--warn' : ''}`} role="status" aria-live="polite">
        <Icon name={notice.kind === 'warn' ? 'warning' : 'checkCircle'} size={18} className="shrink-0" />
        <span className="editor-notice__text">{notice.text}</span>
        <button type="button" className="editor-notice__close" onClick={hideNotice} aria-label="Закрыть сообщение">
          <Icon name="close" size={16} />
        </button>
      </div>
    </div>
  );
};
