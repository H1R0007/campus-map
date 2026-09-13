import L from 'leaflet';
import type { TransitionType } from '@campus-map/core';
import { TRANSITION_COLORS, transitionGlyphMarkup } from '@campus-map/mapkit';
import { messagesFor } from '../../i18n';
import type { Language } from '../../i18n/languages';

/**
 * Иконки маркеров навигатора.
 *
 * Leaflet-иконка — объект с HTML-разметкой, и создавать её на каждый рендер
 * означало бы заново парсить SVG для каждого маркера. Поэтому экземпляры
 * кэшируются: на тип точки их фиксированное число.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

type EndpointKind = 'start' | 'end';

const endpointIcons = new Map<string, L.DivIcon>();

/**
 * Маркер начала или конца маршрута.
 *
 * Цвет задаёт класс `campus-endpoint--*` из токенов темы (`index.css`).
 * Подпись для экранного диктора — на языке интерфейса, поэтому экземпляр
 * кэшируется по паре «вид точки + язык».
 */
export function endpointIcon(kind: EndpointKind, language: Language): L.DivIcon {
  const key = `${kind}:${language}`;

  const cached = endpointIcons.get(key);
  if (cached) return cached;

  const messages = messagesFor(language);
  const label = kind === 'start' ? messages.map.routeStart : messages.map.routeEnd;

  const icon = L.divIcon({
    className: 'campus-marker campus-marker--endpoint',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    html: `<svg width="28" height="28" viewBox="0 0 28 28" xmlns="${SVG_NS}" role="img" aria-label="${label}">
      <circle class="campus-endpoint--${kind}" cx="14" cy="14" r="9" stroke="#ffffff" stroke-width="3"/>
    </svg>`,
  });

  endpointIcons.set(key, icon);
  return icon;
}

/**
 * Подложка точки перехода, тип которой не определился. Это ошибка разметки,
 * но точку всё равно видно. Белый поверх неё — 4,8:1.
 */
const UNKNOWN_PORTAL_COLOR = '#64748B';

const portalIcons = new Map<TransitionType | 'unknown', L.DivIcon>();

/**
 * Иконка точки перехода между этажами или корпусами.
 *
 * Цвет и значок — из `TRANSITION_COLORS` и контуров mapkit, поэтому на плане
 * видно, где лестница, где лифт, а где вход в корпус, — теми же
 * обозначениями, что в шагах маршрута и в редакторе.
 */
export function portalIcon(type: TransitionType | null): L.DivIcon {
  const key = type ?? 'unknown';

  const cached = portalIcons.get(key);
  if (cached) return cached;

  const color = type ? TRANSITION_COLORS[type] : UNKNOWN_PORTAL_COLOR;
  const glyph = type ? transitionGlyphMarkup(type, 14) : '';

  const icon = L.divIcon({
    className: 'campus-marker campus-marker--portal',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    html: `<span style="background:${color}">${glyph}</span>`,
  });

  portalIcons.set(key, icon);
  return icon;
}
