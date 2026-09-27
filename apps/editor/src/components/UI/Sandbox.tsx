import React, { useState } from 'react';
import { SPACE } from '../../config/space';
import { useEditorStore, useUnsavedChanges } from '../../stores/editorStore';
import { ConfirmDialog } from './ConfirmDialog';
import { Icon } from './Icon';

/**
 * Учебная копия (запись 55): кнопка входа в шапке и полоса над редактором,
 * пока он открыт с копией.
 *
 * Копия — те же данные в отдельном каталоге: в ней работает всё, включая
 * сохранение, а настоящие данные и навигатор не меняются.
 */

const dateFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

/** Кнопка в шапке; видна только с настоящими данными и там, где копия возможна. */
export const SandboxButton: React.FC = () => {
  const sandbox = useEditorStore((s) => s.sandbox);
  const enterSandbox = useEditorStore((s) => s.enterSandbox);
  const unsaved = useUnsavedChanges();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (SPACE === 'sandbox' || sandbox === null) return null;

  const enter = async (fresh: boolean) => {
    setBusy(true);
    setError(null);
    const failure = await enterSandbox(fresh);
    // Удачный вход уводит со страницы; сюда возвращаемся только с ошибкой.
    setBusy(false);
    setError(failure);
  };

  return (
    <>
      <button
        type="button"
        className="editor-button editor-button--ghost"
        onClick={() => setOpen(true)}
        title="Учебная копия: пробовать правки, не меняя настоящие данные"
      >
        <Icon name="flask" />
        Учебная копия
      </button>

      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Учебная копия"
        footer={
          <>
            <button type="button" className="editor-button editor-button--ghost" onClick={() => setOpen(false)}>
              Отмена
            </button>
            {sandbox.exists && (
              <button type="button" className="editor-button editor-button--ghost" disabled={busy} onClick={() => void enter(true)}>
                Начать с чистой копии
              </button>
            )}
            <button type="button" className="editor-button editor-button--primary" disabled={busy} onClick={() => void enter(false)}>
              {sandbox.exists ? 'Продолжить в копии' : 'Открыть копию'}
            </button>
          </>
        }
      >
        <p className="editor-dialog__text editor-dialog__text--lead">
          Копия данных для проб. В ней работает всё, включая «Сохранить», но настоящие данные и навигатор не меняются.
        </p>
        {sandbox.exists && (
          <p className="editor-dialog__text">
            {sandbox.createdAt ? `Копия сделана ${dateFormat.format(sandbox.createdAt)}. ` : ''}
            «Начать с чистой копии» уберёт прежние пробы.
          </p>
        )}
        {unsaved && (
          <p className="editor-dialog__text">
            Несохранённые правки останутся в черновике и вернутся, когда вы выйдете из копии.
          </p>
        )}
        {error && <p className="editor-dialog__text editor-dialog__text--warn">Копия не открылась: {error}</p>}
      </ConfirmDialog>
    </>
  );
};

/** Полоса над редактором, пока открыта копия: видно всегда, куда идут правки. */
export const SandboxBanner: React.FC = () => {
  const leaveSandbox = useEditorStore((s) => s.leaveSandbox);
  const restartSandbox = useEditorStore((s) => s.restartSandbox);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (SPACE !== 'sandbox') return null;

  return (
    <div className="editor-sandbox-banner" role="status">
      <Icon name="flask" />
      <span className="editor-sandbox-banner__text">
        <b>Учебная копия.</b> Правки и сохранения остаются в копии, настоящие данные не меняются.
      </span>
      {error && <span className="editor-sandbox-banner__error">{error}</span>}
      <button type="button" className="editor-button editor-button--ghost editor-button--small" onClick={() => setConfirm(true)}>
        Начать заново
      </button>
      <button type="button" className="editor-button editor-button--ghost editor-button--small" onClick={() => void leaveSandbox()}>
        Выйти из копии
      </button>

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Начать заново?"
        footer={
          <>
            <button type="button" className="editor-button editor-button--ghost" onClick={() => setConfirm(false)}>
              Отмена
            </button>
            <button
              type="button"
              className="editor-button editor-button--primary"
              onClick={async () => {
                setConfirm(false);
                setError(await restartSandbox());
              }}
            >
              Начать заново
            </button>
          </>
        }
      >
        <p className="editor-dialog__text">Все пробы в копии пропадут, копия снова станет такой же, как настоящие данные.</p>
      </ConfirmDialog>
    </div>
  );
};
