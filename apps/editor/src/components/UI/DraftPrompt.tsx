import React, { useEffect, useRef } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { Icon } from './Icon';

/** Когда черновик записан, словами: «сегодня в 14:32», «17 сентября в 9:05». */
function savedAtLabel(savedAt: number): string {
  const time = new Date(savedAt);
  const today = new Date();
  const sameDay =
    time.getFullYear() === today.getFullYear() &&
    time.getMonth() === today.getMonth() &&
    time.getDate() === today.getDate();

  const clock = time.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return `сегодня в ${clock}`;
  return `${time.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })} в ${clock}`;
}

/**
 * Предложение восстановить несохранённую работу.
 *
 * Показывается при открытии, если в браузере остался черновик: вкладку
 * закрыли, страница перезагрузилась или браузер упал. Пока человек не решил,
 * черновик никуда не девается — Escape просто откладывает решение.
 */
export const DraftPrompt: React.FC = () => {
  const draft = useEditorStore((s) => s.draftFound);
  const diskHashes = useEditorStore((s) => s.diskHashes);
  const restoreDraft = useEditorStore((s) => s.restoreDraft);
  const dismissDraft = useEditorStore((s) => s.dismissDraft);
  const keepDraft = useEditorStore((s) => s.keepDraft);
  const restoreRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!draft) return;
    restoreRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        keepDraft();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [draft, keepDraft]);

  if (!draft) return null;

  // Файлы на диске изменились после черновика: там чужая правка или другая ветка.
  const diskChanged = Object.entries(draft.base).some(([path, hash]) => diskHashes[path] !== hash);

  return (
    <div className="editor-dialog-backdrop">
      <div className="editor-dialog" role="dialog" aria-modal="true" aria-labelledby="draft-prompt-title">
        <h2 className="editor-dialog__title" id="draft-prompt-title">
          <Icon name="note" size={18} className="inline-block mr-2 align-middle" />
          Осталась несохранённая работа
        </h2>
        <p className="editor-dialog__text">
          Редактор записал её в браузере {savedAtLabel(draft.savedAt)}: узлов {draft.dataset.nodes.length},
          переходов {draft.dataset.transitions.length}. Восстановить и продолжить?
        </p>
        {diskChanged && (
          <p className="editor-dialog__text editor-dialog__text--warn">
            Внимание: файлы данных на диске изменились после того, как черновик был записан. Восстановленная
            работа не будет знать об этих правках.
          </p>
        )}
        <div className="editor-dialog__actions">
          <button type="button" className="editor-button editor-button--ghost" onClick={dismissDraft}>
            Отбросить
          </button>
          <button ref={restoreRef} type="button" className="editor-button editor-button--primary" onClick={restoreDraft}>
            Восстановить
          </button>
        </div>
      </div>
    </div>
  );
};
