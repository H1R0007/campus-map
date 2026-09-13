import { useCallback, useEffect, useRef, useState } from 'react';
import { useLanguage } from '../i18n';
import { useMapStore } from '../stores/mapStore';
import { useRouteStore } from '../stores/routeStore';
import { readLinkParams, resolveLink, routeLink } from '../utils/deepLink';

/**
 * Ссылка в адресной строке.
 *
 * После загрузки данных ссылка применяется один раз: `?from=&to=` строит
 * маршрут, `?at=` ставит начало маршрута и показывает этаж этой точки.
 * Дальше адресная строка повторяет концы маршрута и язык — перезагрузка
 * вкладки (телефон выгружает её из памяти) маршрут не теряет, а «Поделиться»
 * отправляет ровно показанный маршрут. Запись — `replaceState`: смена точки
 * не должна плодить шаги истории, по которым «назад» уводил бы с сайта не сразу.
 *
 * @returns точки из ссылки, которых нет в данных, и способ скрыть сообщение
 */
export function useRouteLink(): { unresolved: readonly string[]; dismiss: () => void } {
  const graph = useMapStore((s) => s.graph);
  const fromNodeId = useRouteStore((s) => s.fromNodeId);
  const toNodeId = useRouteStore((s) => s.toNodeId);
  const language = useLanguage();

  const [unresolved, setUnresolved] = useState<readonly string[]>([]);
  const applied = useRef(false);

  useEffect(() => {
    if (graph === null || applied.current) return;
    applied.current = true;

    const { aliasManager, showNode } = useMapStore.getState();
    const { setPoint } = useRouteStore.getState();
    const link = resolveLink(readLinkParams(window.location.search), graph, aliasManager);

    if (link.from !== null) setPoint('from', link.from);

    // Обе точки — маршрут строится, и карта сама переходит к началу. Только
    // «вы здесь» — карта показывает этаж, где человек стоит.
    if (link.to !== null) setPoint('to', link.to);
    else if (link.from !== null) showNode(link.from);

    setUnresolved(link.unresolved);
  }, [graph]);

  useEffect(() => {
    // Пока ссылка не применена, адрес не трогаем: первый рендер с пустыми
    // точками стёр бы её раньше, чем она прочитана.
    if (!applied.current) return;

    const { pathname, search, hash } = window.location;
    const next = routeLink(pathname, { from: fromNodeId, to: toNodeId }, language) + hash;

    if (next !== `${pathname}${search}${hash}`) {
      window.history.replaceState(window.history.state, '', next);
    }
  }, [fromNodeId, toNodeId, language]);

  const dismiss = useCallback(() => setUnresolved([]), []);

  return { unresolved, dismiss };
}
