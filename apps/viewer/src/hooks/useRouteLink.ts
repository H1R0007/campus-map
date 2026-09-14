import { useCallback, useEffect, useRef, useState } from 'react';
import { useLanguage } from '../i18n';
import { useMapStore } from '../stores/mapStore';
import { useRouteStore } from '../stores/routeStore';
import { readLinkParams, resolveLink, routeLink } from '../utils/deepLink';

/**
 * Ссылка в адресной строке.
 *
 * После загрузки данных ссылка применяется один раз: `?from=&to=` строит
 * маршрут, `?at=` ставит начало маршрута и показывает этаж этой точки, `?to=`
 * без начала показывает карточку цели на её этаже.
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

    const { aliasManager, showNode, selectNode } = useMapStore.getState();
    const { setPoint } = useRouteStore.getState();
    const link = resolveLink(readLinkParams(window.location.search), graph, aliasManager);

    if (link.from !== null) setPoint('from', link.from);
    if (link.to !== null) setPoint('to', link.to);

    // Обе точки — маршрут построен, и карта сама перешла к началу. Только
    // «вы здесь» — карта показывает этаж, где человек стоит. Только цель —
    // её карточка: оттуда один шаг до маршрута.
    if (link.to === null && link.from !== null) showNode(link.from);
    if (link.from === null && link.to !== null) {
      showNode(link.to);
      selectNode(link.to);
    }

    setUnresolved(link.unresolved);
  }, [graph]);

  useEffect(() => {
    // Пока ссылка не применена, адрес не трогаем: первый рендер с пустыми
    // точками стёр бы её раньше, чем она прочитана.
    if (!applied.current) return;

    const current = window.location.href;
    const next = routeLink(current, { from: fromNodeId, to: toNodeId }, language);

    if (next !== current) {
      window.history.replaceState(window.history.state, '', next);
    }
  }, [fromNodeId, toNodeId, language]);

  const dismiss = useCallback(() => setUnresolved([]), []);

  return { unresolved, dismiss };
}
