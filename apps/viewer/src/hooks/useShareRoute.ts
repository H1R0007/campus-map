import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useMessages } from '../i18n';
import { browserShareEnvironment, shareLink } from '../utils/shareLink';

/** Сколько видно подтверждение «Ссылка скопирована», мс. */
const LINK_COPIED_MS = 2500;

export interface ShareRoute {
  /** Поделиться адресом: системным окном, копированием или окном ручного копирования. */
  share: () => void;
  copied: boolean;
  /** Ссылка, которую не удалось скопировать; `null` — окно ручного копирования закрыто. */
  manualLink: string | null;
  closeManual: () => void;
  /** Кнопка «Поделиться»: на неё возвращается фокус после окна ручного копирования. */
  buttonRef: RefObject<HTMLButtonElement>;
}

/**
 * «Поделиться маршрутом» и его обратная связь.
 *
 * Кнопка стоит в обзоре маршрута, а подтверждение и окно ручного копирования —
 * в корне панели: они должны пережить смену её содержимого. Поэтому состояние
 * живёт здесь, в хуке панели, и передаётся обзору.
 *
 * Адрес уже описывает маршрут: его концы в адресной строке держит
 * `useRouteLink`, и получатель ссылки увидит тот же маршрут.
 */
export function useShareRoute(): ShareRoute {
  const messages = useMessages();
  // Время копирования, а не флаг: повторное копирование заново заводит таймер.
  const [copiedAt, setCopiedAt] = useState<number | null>(null);
  const [manualLink, setManualLink] = useState<string | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Подтверждение гаснет само: действие уже выполнено, закрывать нечего.
  useEffect(() => {
    if (copiedAt === null) return;
    const timer = setTimeout(() => setCopiedAt(null), LINK_COPIED_MS);
    return () => clearTimeout(timer);
  }, [copiedAt]);

  const share = () => {
    const url = window.location.href;
    void shareLink(url, messages.route.title, browserShareEnvironment()).then((outcome) => {
      if (outcome === 'copied') setCopiedAt(Date.now());
      if (outcome === 'manual') setManualLink(url);
    });
  };

  const closeManual = () => {
    setManualLink(null);
    buttonRef.current?.focus();
  };

  return { share, copied: copiedAt !== null, manualLink, closeManual, buttonRef };
}
