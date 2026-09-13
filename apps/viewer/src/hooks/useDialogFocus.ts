import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Фокус модальной шторки: при открытии — внутри, Escape закрывает, Tab не
 * уходит за её пределы.
 *
 * Без этого клавиатура и экранный диктор уходили за затемнение — к карте,
 * которой в этот момент не видно, — а Escape ничего не делал.
 *
 * Возврат фокуса после закрытия — забота вызывающей стороны: кнопка, которой
 * шторку открыли, при разворачивании исчезает из разметки, и вернуть фокус
 * можно только на ту, что появится вместо неё.
 *
 * Escape внутри поля с открытым списком подсказок сначала закрывает список:
 * поле останавливает всплытие события, и до этого обработчика оно не доходит.
 */
export function useDialogFocus(
  containerRef: RefObject<HTMLElement>,
  open: boolean,
  onClose: () => void
): void {
  // Обработчик меняется на каждый рендер; подписка — нет.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const container = containerRef.current;
    if (!container) return;

    if (!container.contains(document.activeElement)) {
      container.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = [...container.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [containerRef, open]);
}
