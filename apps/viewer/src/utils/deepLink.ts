import type { AliasManager, Graph } from '@campus-map/core';
import { DATA_LANGUAGE } from '../i18n/languages';
import type { Language } from '../i18n/languages';

/**
 * Ссылки навигатора: маршрут `?from=&to=` и точка «вы здесь» `?at=`.
 *
 * `at` печатается в QR-коде у входа в корпус: навигатор открывается с началом
 * маршрута в этой точке. В помещении это надёжнее геолокации — её там нет, а
 * у карты нет географической привязки. Язык в ссылке (`?lang=`) читает
 * `settingsStore`.
 *
 * В параметрах — id узлов: они стабильны и однозначны. Название тоже
 * принимается, если оно указывает ровно на одно помещение.
 */

/** Параметры ссылки, как они записаны в адресе, — ещё не разрешённые. */
export interface LinkParams {
  from: string | null;
  to: string | null;
  at: string | null;
}

/** Точки ссылки, разрешённые в узлы графа. */
export interface ResolvedLink {
  /** Начало маршрута: `at` важнее `from` — QR-код у двери точнее пересланной ссылки. */
  from: string | null;
  to: string | null;
  /** Значения из ссылки, которые не нашлись в данных, — их нужно назвать пользователю. */
  unresolved: string[];
}

export function readLinkParams(search: string): LinkParams {
  const params = new URLSearchParams(search);
  const read = (name: string) => {
    const value = params.get(name)?.trim();
    return value ? value : null;
  };

  return { from: read('from'), to: read('to'), at: read('at') };
}

/**
 * Разрешает точку — из ссылки или из поля ввода — в id узла.
 *
 * Сначала точное однозначное название, затем id узла: ссылку можно собрать и
 * по названию («?to=Библиотека»), а по id — открыть узел без алиаса при
 * отладке данных. Неоднозначное название не разрешается (запись 7).
 */
export function resolvePoint(
  value: string,
  graph: Graph | null,
  aliasManager: AliasManager | null
): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const byAlias = aliasManager?.resolve(trimmed) ?? null;
  if (byAlias) return byAlias;

  return graph?.hasNode(trimmed) ? trimmed : null;
}

/**
 * Разрешает точки ссылки.
 *
 * Неразрешённая точка не пропадает молча: устаревший QR-код после
 * переразметки должен выдать себя сообщением, а не открыть пустую карту.
 */
export function resolveLink(
  params: LinkParams,
  graph: Graph | null,
  aliasManager: AliasManager | null
): ResolvedLink {
  const unresolved: string[] = [];
  const resolve = (value: string | null) => {
    if (value === null) return null;
    const nodeId = resolvePoint(value, graph, aliasManager);
    if (nodeId === null) unresolved.push(value);
    return nodeId;
  };

  const from = resolve(params.at ?? params.from);
  const to = resolve(params.to);

  return { from, to, unresolved };
}

/**
 * Адрес текущего состояния: путь страницы и параметры маршрута.
 *
 * Путь берётся текущий, а не собирается от корня: навигатор может стоять в
 * подкаталоге (`CAMPUS_BASE_PATH`). Язык записывается, только если он не язык
 * данных, — русская ссылка остаётся короткой, а английская открывается
 * по-английски у любого получателя.
 */
export function routeLink(
  pathname: string,
  points: { from: string | null; to: string | null },
  language: Language
): string {
  const params = new URLSearchParams();
  if (points.from !== null) params.set('from', points.from);
  if (points.to !== null) params.set('to', points.to);
  if (language !== DATA_LANGUAGE) params.set('lang', language);

  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
