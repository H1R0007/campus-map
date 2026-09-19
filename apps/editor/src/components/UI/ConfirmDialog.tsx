import React, { useRef } from 'react';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import { Icon } from './Icon';

type Props = {
  title: string;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
};

/**
 * Окно с вопросом: проверка перед сохранением и другие подтверждения.
 *
 * Модальное по правилам: фокус внутри, Tab не уходит наружу, Escape
 * закрывает, после закрытия фокус возвращается туда, где был.
 */
export const ConfirmDialog: React.FC<Props> = ({ title, open, onClose, children, footer }) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(open, dialogRef, onClose);

  if (!open) return null;

  return (
    <div className="editor-dialog-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="editor-dialog editor-dialog--wide"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="editor-help__head">
          <h2 id="confirm-dialog-title" className="editor-dialog__title">
            {title}
          </h2>
          <button type="button" className="editor-icon-button" onClick={onClose} aria-label="Закрыть">
            <Icon name="close" />
          </button>
        </div>

        <div className="editor-dialog__body">{children}</div>

        <div className="editor-dialog__actions">{footer}</div>
      </div>
    </div>
  );
};
