import { useEffect } from 'react';
import type { RefObject } from 'react';

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Фокус в модальном окне: при открытии — внутрь окна, Tab не уходит за его
 * пределы, Escape закрывает, после закрытия фокус возвращается туда, где был.
 *
 * Без этого человек с клавиатурой или экранным диктором уходил Tab-ом за
 * окно, на карту под затемнением, и терял, где находится.
 *
 * @param initial элемент, который получает фокус первым; по умолчанию —
 *   первый доступный в окне
 */
export function useDialogFocus(
  open: boolean,
  container: RefObject<HTMLElement | null>,
  onClose: () => void,
  initial?: RefObject<HTMLElement | null>
): void {
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const root = container.current;
    (initial?.current ?? root?.querySelector<HTMLElement>(FOCUSABLE) ?? root)?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !root) return;
      const items = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      previous?.focus?.();
    };
  }, [open, container, onClose, initial]);
}
