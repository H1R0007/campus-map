import React, { useRef } from 'react';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import { useMessages } from '../../i18n';

interface ShareFeedbackProps {
  /** Ссылка только что скопирована. */
  copied: boolean;
  /** Ссылка, которую скопировать не удалось; `null` — окно закрыто. */
  manualLink: string | null;
  onCloseManual: () => void;
}

const MANUAL_TITLE_ID = 'share-link-title';
const MANUAL_HINT_ID = 'share-link-hint';

/**
 * Итог «Поделиться»: подтверждение копирования и окно со ссылкой, если
 * скопировать не удалось (`shareLink`).
 *
 * Подтверждение раньше подменяло вторую строку карточки маршрута и исчезало
 * вместе с ней: стоило развернуть шторку или нажать на план — сообщения никто
 * не видел. Теперь оно стоит под шапкой поверх шторки в любом её состоянии, а
 * экранному диктору его объявляет постоянная область `aria-live` (запись 15).
 *
 * Когда нет ни системного окна, ни буфера обмена (сайт по HTTP, запрет
 * браузера), раньше не происходило ничего. Теперь открывается диалог со
 * ссылкой, выделенной целиком: остаётся скопировать её вручную.
 */
export const ShareFeedback: React.FC<ShareFeedbackProps> = ({ copied, manualLink, onCloseManual }) => {
  const messages = useMessages();
  const dialogRef = useRef<HTMLDivElement>(null);

  useDialogFocus(dialogRef, manualLink !== null, onCloseManual);

  return (
    <>
      <div
        role="status"
        aria-live="polite"
        className="fixed left-1/2 -translate-x-1/2 top-[calc(4.5rem+env(safe-area-inset-top))] z-[1002] pointer-events-none"
      >
        {copied && (
          <div className="flex items-center gap-2 whitespace-nowrap rounded-full bg-gray-900/90 px-4 py-2 text-sm text-white shadow-lg">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
            {messages.route.linkCopied}
          </div>
        )}
      </div>

      {manualLink !== null && (
        <>
          <div className="fixed inset-0 bg-black/30 z-[1003]" onClick={onCloseManual} aria-hidden="true" />

          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={MANUAL_TITLE_ID}
            aria-describedby={MANUAL_HINT_ID}
            className="fixed left-3 right-3 top-1/2 -translate-y-1/2 md:left-1/2 md:right-auto md:w-96 md:-translate-x-1/2 z-[1004] rounded-2xl bg-white p-4 shadow-2xl"
          >
            <h2 id={MANUAL_TITLE_ID} className="font-semibold text-gray-800">
              {messages.route.copyLinkTitle}
            </h2>
            <p id={MANUAL_HINT_ID} className="mt-1 text-sm text-gray-600">
              {messages.route.copyLinkHint}
            </p>

            <input
              readOnly
              value={manualLink}
              aria-label={messages.route.linkLabel}
              // Фокус приходит сюда при открытии (`useDialogFocus`), и ссылка
              // сразу выделена: остаётся «Копировать» в меню или Ctrl+C.
              onFocus={(event) => event.currentTarget.select()}
              className="mt-3 w-full rounded-xl border-2 border-gray-100 bg-gray-50 px-3 py-2 text-base text-gray-800"
            />

            <button
              type="button"
              onClick={onCloseManual}
              className="mt-3 w-full h-11 rounded-xl bg-primary text-sm font-medium text-white hover:bg-primary-hover transition-colors"
            >
              {messages.route.done}
            </button>
          </div>
        </>
      )}
    </>
  );
};
