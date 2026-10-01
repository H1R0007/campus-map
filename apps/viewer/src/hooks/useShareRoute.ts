import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useMessages } from '../i18n';
import { browserShareEnvironment, shareLink } from '../utils/shareLink';

/** Сколько видно подтверждение «Ссылка скопирована», мс. */
const LINK_COPIED_MS = 2500;

/** Чем делятся: маршрутом или местом — от этого подпись поля в окне ручного копирования. */
export type ShareKind = 'route' | 'place';

export interface ShareRoute {
  /** Поделиться адресом маршрута: системным окном, копированием или окном ручного копирования. */
  share: () => void;
  /** Поделиться местом: ссылкой на его карточку (`?to=`), а не текущим адресом. */
  sharePlace: (url: string, name: string) => void;
  copied: boolean;
  /** Ссылка, которую не удалось скопировать; `null` — окно ручного копирования закрыто. */
  manual: { url: string; kind: ShareKind } | null;
  closeManual: () => void;
  /** Кнопка «Поделиться»: на неё возвращается фокус после окна ручного копирования. */
  buttonRef: RefObject<HTMLButtonElement>;
}

/**
 * «Поделиться» маршрутом или местом и его обратная связь.
 *
 * Кнопки стоят в обзоре маршрута и в карточке места, а подтверждение и окно
 * ручного копирования — в корне панели: они должны пережить смену её
 * содержимого. Поэтому состояние живёт здесь, в хуке панели, и передаётся
 * содержимому.
 *
 * Адрес уже описывает маршрут: его концы в адресной строке держит
 * `useRouteLink`, и получатель ссылки увидит тот же маршрут. Место в адресе не
 * записано — выбор места не меняет адрес, — и ссылку на него собирает карточка:
 * получатель увидит карточку и построит маршрут от себя.
 */
export function useShareRoute(): ShareRoute {
  const messages = useMessages();
  // Время копирования, а не флаг: повторное копирование заново заводит таймер.
  const [copiedAt, setCopiedAt] = useState<number | null>(null);
  const [manual, setManual] = useState<{ url: string; kind: ShareKind } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Подтверждение гаснет само: действие уже выполнено, закрывать нечего.
  useEffect(() => {
    if (copiedAt === null) return;
    const timer = setTimeout(() => setCopiedAt(null), LINK_COPIED_MS);
    return () => clearTimeout(timer);
  }, [copiedAt]);

  const run = (url: string, title: string, kind: ShareKind) => {
    void shareLink(url, title, browserShareEnvironment()).then((outcome) => {
      if (outcome === 'copied') setCopiedAt(Date.now());
      if (outcome === 'manual') setManual({ url, kind });
    });
  };

  const share = () => run(window.location.href, messages.route.title, 'route');
  const sharePlace = (url: string, name: string) => run(url, name, 'place');

  const closeManual = () => {
    setManual(null);
    buttonRef.current?.focus();
  };

  return { share, sharePlace, copied: copiedAt !== null, manual, closeManual, buttonRef };
}
